// /api/v1/evidence — viewing evidence (docs/10 §3).
//   GET /:id            details and custody log
//   GET /:id/view       the viewing copy, for anyone who can see its report or case
//   GET /:id/original   the original — needs evidence.viewOriginal and a
//                       reason, which goes on the custody log and the audit log

import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requirePermission } from "#src/core/access/guards.js";
import { scopeOf } from "#src/core/access/permissions.js";
import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { forbidden, notFound } from "#src/core/errors.js";
import { query } from "#src/core/http/validate.js";
import { Case, visibleCase } from "../cases/index.js";
import { visibleReport } from "../reports/index.js";
import { Evidence } from "./evidence.model.js";
import { evidenceView } from "./index.js";

/** @param {import("express").Request} req */
const actor = (req) => /** @type {NonNullable<typeof req.auth>} */ (req.auth);

/**
 * Loads an item the user may see — through the scope of its report or case.
 * Returns what it belongs to, for the custody and audit records.
 * @param {any} who @param {string} id
 */
async function loadVisible(who, id) {
  if (!mongoose.isValidObjectId(id)) throw notFound("Evidence not found.");
  const item = await Evidence.findById(id);
  if (item?.reportId) {
    const report = await visibleReport(who, String(item.reportId));
    return {
      item,
      owner: {
        type: "report",
        id: String(report._id),
        label: report.reportNumber,
        stationId: report.stationId,
        caseId: report.caseId,
      },
    };
  }
  if (item?.caseId) {
    const c = await visibleCase(who, String(item.caseId));
    return {
      item,
      owner: {
        type: "case",
        id: String(c._id),
        label: c.caseNumber,
        stationId: c.stationId,
        caseId: c._id,
      },
    };
  }
  throw notFound("Evidence not found.");
}

/**
 * Officers (scope A) open originals only of the cases they investigate.
 * @param {any} who @param {any} caseId
 */
async function assignedTo(who, caseId) {
  if (!caseId) return false;
  const c = await Case.findById(caseId, { investigatingOfficer: 1 }).lean();
  return String(c?.investigatingOfficer?.id ?? "") === String(who.userId);
}

/**
 * @param {import("express").Response} res
 * @param {{ stream: import("node:stream").Readable, size: number | null }} file
 * @param {{ mime: string, name: string, download: boolean }} meta
 */
function send(res, file, meta) {
  res.setHeader("Content-Type", meta.mime);
  if (file.size) res.setHeader("Content-Length", String(file.size));
  // Evidence must not linger in shared caches or proxies.
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Disposition",
    `${meta.download ? "attachment" : "inline"}; filename="${meta.name.replace(/[^\w.-]/g, "_")}"`,
  );
  file.stream.pipe(res);
}

/** @param {import("#src/core/storage.js").Storage} storage */
export function evidenceRoutes(storage) {
  const router = Router();
  const view = requirePermission("reports.view");

  router.get("/:id", view, async (req, res) => {
    const { item } = await loadVisible(actor(req), String(req.params.id));
    res.json({
      ...evidenceView(item),
      custody: item.custody.map((c) => ({
        at: c.at.toISOString(),
        event: c.event,
        by: c.by,
        note: c.note ?? null,
      })),
    });
  });

  router.get("/:id/view", view, async (req, res) => {
    const { item } = await loadVisible(actor(req), String(req.params.id));
    send(res, await storage.get(item.viewKey), {
      mime: item.mime,
      name: item.originalName ?? `evidence.${item.mime.split("/")[1]}`,
      download: false,
    });
  });

  router.get(
    "/:id/original",
    requirePermission("evidence.viewOriginal"),
    query(
      z.object({ reason: z.string().trim().min(5, "Say why you need the original.").max(300) }),
    ),
    async (req, res) => {
      const who = actor(req);
      const { item, owner } = await loadVisible(who, String(req.params.id));
      if (
        scopeOf(who.role, "evidence.viewOriginal") === "A" &&
        !(await assignedTo(who, owner.caseId))
      ) {
        throw forbidden("You can open originals of the cases you investigate.");
      }
      const reason = req.validQuery.reason;
      await inTransaction(async (session) => {
        item.custody.push({
          at: new Date(),
          event: "original_opened",
          by: who.name,
          byId: who.userId,
          note: reason,
        });
        await item.save({ session });
        await recordAudit(
          {
            actor: { kind: "staff", id: who.userId, name: who.name, role: who.role },
            action: "evidence.original_opened",
            summary: `Opened the original of evidence on ${owner.label}: ${reason}`,
            target: { type: owner.type, id: owner.id, label: owner.label },
            source: { ip: req.ip ?? null, userAgent: req.get("user-agent")?.slice(0, 300) ?? null },
            places: [who, { stationId: owner.stationId }],
          },
          session,
        );
      });
      send(res, await storage.get(item.originalKey), {
        mime: item.mime,
        name: item.originalName ?? `original.${item.mime.split("/")[1]}`,
        download: true,
      });
    },
  );
  return router;
}

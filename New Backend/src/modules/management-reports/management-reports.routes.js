// /api/v1/management-reports — docs/12 §7 (managementReports.view: HQ, finance,
// auditor and executive nationally; a division supervisor their division; an
// OIC their station).

import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "#src/core/access/guards.js";
import { body, query } from "#src/core/http/validate.js";
import { PERIODS } from "../dashboard/period.js";
import { REPORT_TYPES } from "./catalogue.js";
import {
  configureReports,
  listReports,
  reportFile,
  requestReport,
} from "./management-reports.service.js";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-24.");
const listSchema = z.object({
  type: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const requestSchema = z.object({
  type: z.enum(/** @type {[string, ...string[]]} */ (Object.keys(REPORT_TYPES)), {
    error: "Choose a report.",
  }),
  period: z.enum(PERIODS).default("last_month"),
  from: ymd.optional(),
  to: ymd.optional(),
  divisionId: z.string().trim().max(30).optional(),
  stationId: z.string().trim().max(30).optional(),
});

/** @param {import("express").Request} req */
const actor = (req) => /** @type {NonNullable<typeof req.auth>} */ (req.auth);
/** @param {import("express").Request} req */
const ctx = (req) => ({ ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null });

/** @param {import("#src/core/storage.js").Storage} storage */
export function managementReportsRoutes(storage) {
  configureReports(storage);
  const router = Router();
  const view = requirePermission("managementReports.view");
  router.get("/", view, query(listSchema), async (req, res) => {
    res.json(await listReports(actor(req), req.validQuery));
  });
  router.post("/", view, body(requestSchema), async (req, res) => {
    res.status(201).json(await requestReport(actor(req), req.body, ctx(req)));
  });
  router.get("/runs/:id/:format", view, async (req, res) => {
    const format = req.params.format === "csv" ? "csv" : "pdf";
    const f = await reportFile(actor(req), String(req.params.id), format);
    res.setHeader("Content-Type", f.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${f.name}"`);
    if (f.size) res.setHeader("Content-Length", String(f.size));
    f.stream.pipe(res);
  });
  return router;
}

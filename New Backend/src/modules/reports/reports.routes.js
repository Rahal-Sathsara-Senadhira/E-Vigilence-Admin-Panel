// /api/v1/reports — recording and triage (docs/02).

import { Router } from "express";
import { requirePermission } from "#src/core/access/guards.js";
import { body, query } from "#src/core/http/validate.js";
import {
  acceptSchema,
  listSchema,
  mergeSchema,
  prioritySchema,
  questionSchema,
  reasonSchema,
  recordSchema,
  rejectSchema,
  replySchema,
} from "./reports.schemas.js";
import { receiveUpload } from "../evidence/receive-upload.js";
import {
  acceptReport,
  addEvidence,
  askReporter,
  changePriority,
  confirmStationReport,
  getReport,
  listReports,
  mergeReport,
  reconsiderReport,
  recordReply,
  recordReport,
  rejectReport,
  releaseLock,
  secondOfficerAccept,
  takeLock,
  undoMerge,
} from "./reports.service.js";

/** @param {import("express").Request} req */
const ctx = (req) => ({
  ip: req.ip ?? null,
  userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
});
/** @param {import("express").Request} req */
const actor = (req) => /** @type {NonNullable<typeof req.auth>} */ (req.auth);
/** @param {import("express").Request} req */
const idOf = (req) => String(req.params.id);

/** @param {import("#src/core/storage.js").Storage} storage */
export function reportsRoutes(storage) {
  const router = Router();
  const view = requirePermission("reports.view");
  const record = requirePermission("reports.record");
  const triage = requirePermission("reports.triage");

  router.get("/", view, query(listSchema), async (req, res) => {
    res.json(await listReports(actor(req), req.validQuery));
  });
  router.get("/:id", view, async (req, res) => {
    res.json(await getReport(actor(req), idOf(req)));
  });
  router.post("/", record, body(recordSchema), async (req, res) => {
    res.status(201).json(await recordReport(actor(req), req.body, ctx(req)));
  });
  router.post("/:id/evidence", record, async (req, res) => {
    const file = await receiveUpload(req);
    res.status(201).json(await addEvidence(actor(req), idOf(req), file, storage, ctx(req)));
  });
  router.post("/:id/second-officer", record, async (req, res) => {
    res.json(await secondOfficerAccept(actor(req), idOf(req), ctx(req)));
  });

  router.post("/:id/lock", triage, async (req, res) => {
    res.json(await takeLock(actor(req), idOf(req)));
  });
  router.delete("/:id/lock", triage, async (req, res) => {
    await releaseLock(actor(req), idOf(req));
    res.status(204).end();
  });
  router.post("/:id/accept", triage, body(acceptSchema), async (req, res) => {
    res.json(await acceptReport(actor(req), idOf(req), req.body, ctx(req)));
  });
  router.post("/:id/merge", triage, body(mergeSchema), async (req, res) => {
    res.json(await mergeReport(actor(req), idOf(req), req.body, ctx(req)));
  });
  router.post("/:id/undo-merge", triage, body(reasonSchema), async (req, res) => {
    res.json(await undoMerge(actor(req), idOf(req), req.body.reason, ctx(req)));
  });
  router.post("/:id/ask", triage, body(questionSchema), async (req, res) => {
    res.json(await askReporter(actor(req), idOf(req), req.body.question, ctx(req)));
  });
  router.post("/:id/reply", triage, body(replySchema), async (req, res) => {
    res.json(await recordReply(actor(req), idOf(req), req.body.answer, ctx(req)));
  });
  router.post("/:id/reject", triage, body(rejectSchema), async (req, res) => {
    res.json(await rejectReport(actor(req), idOf(req), req.body, ctx(req)));
  });
  router.post("/:id/confirm", triage, async (req, res) => {
    res.json(await confirmStationReport(actor(req), idOf(req), ctx(req)));
  });
  router.post("/:id/reconsider", triage, body(reasonSchema), async (req, res) => {
    res.json(await reconsiderReport(actor(req), idOf(req), req.body.reason, ctx(req)));
  });
  router.post("/:id/priority", triage, body(prioritySchema), async (req, res) => {
    res.json(await changePriority(actor(req), idOf(req), req.body, ctx(req)));
  });
  return router;
}

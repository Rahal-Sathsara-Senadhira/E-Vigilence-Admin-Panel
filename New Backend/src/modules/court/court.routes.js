// /api/v1/court-cases and /api/v1/courts — docs/06.

import { Router } from "express";
import { z } from "zod";
import { requirePermission, signedIn } from "#src/core/access/guards.js";
import { scopeOf } from "#src/core/access/permissions.js";
import { forbidden } from "#src/core/errors.js";
import { DISTRICTS } from "#src/core/srilanka.js";
import { body, query } from "#src/core/http/validate.js";
import { COURT_TYPES, HEARING_OUTCOMES, VERDICTS } from "./court.model.js";
import {
  approveFiling,
  confirmVerdict,
  decideAppeal,
  evidenceBundle,
  fileCourtCase,
  getCourtCase,
  listCourtCases,
  listCourts,
  prepareCourtCase,
  recordAppeal,
  recordHearing,
  recordVerdict,
  saveCourt,
  setStationCourt,
  withdrawCourtCase,
} from "./court.service.js";

const listSchema = z.object({
  view: z
    .enum([
      "to_prepare",
      "to_approve",
      "to_file",
      "hearings",
      "verdicts_to_confirm",
      "flagged",
      "closed",
      "all",
    ])
    .default("all"),
  q: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const date = z.coerce.date({ error: "Enter a date." });
const notFuture = (/** @type {string} */ what) =>
  date.refine((d) => d.getTime() <= Date.now() + 86_400_000, `${what} can't be in the future.`);
const reason = z.string().trim().min(10, "Give the reason (10 characters or more).").max(1000);
const prepareSchema = z.object({
  courtId: z.string().trim().min(1, "Choose the court."),
  accusedPersonId: z.string().trim().optional(),
  summary: z
    .string()
    .trim()
    .min(20, "Write the summary for the prosecution (20 characters or more).")
    .max(6000),
});
const fileSchema = z.object({
  courtCaseNumber: z.string().trim().min(2, "Enter the court's case number.").max(60),
  firstHearing: date,
});
const verdictFields = {
  sentence: z.string().trim().max(1000).optional(),
  fineAmount: z.coerce.number().int().min(0).optional(),
  fineReceiptNumber: z.string().trim().max(60).optional(),
};
const hearingSchema = z.object({
  outcome: z.enum(HEARING_OUTCOMES),
  notes: z.string().trim().max(2000).optional(),
  nextDate: date.optional(),
  ...verdictFields,
});
const verdictSchema = z.object({
  result: z.enum(VERDICTS),
  date: notFuture("The verdict date"),
  ...verdictFields,
});
const appealSchema = z.object({
  reference: z.string().trim().min(2, "Enter the appeal reference.").max(60),
  filedAt: notFuture("The appeal date"),
});
const appealResultSchema = z.object({
  result: z.enum(["upheld", "changed"]),
  newVerdict: z.enum(VERDICTS).optional(),
});
const courtSchema = z.object({
  name: z.string().trim().min(3, "Enter the court's name.").max(120),
  code: z.string().trim().min(2, "Enter a short code.").max(20),
  type: z.enum(COURT_TYPES, { error: "Choose the kind of court." }).optional(),
  district: z.enum(DISTRICTS, { error: "Choose the district." }).optional(),
  address: z.string().trim().max(300).optional(),
  phone: z
    .string()
    .trim()
    .max(120)
    .regex(/^[+0-9 ()/,-]*$/, "Use digits, spaces and + ( ) / - only.")
    .optional(),
  isActive: z.boolean().optional(),
});

/** @param {import("express").Request} req */
const ctx = (req) => ({
  ip: req.ip ?? null,
  userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
});
/** @param {import("express").Request} req */
const actor = (req) => /** @type {NonNullable<typeof req.auth>} */ (req.auth);
/** @param {import("express").Request} req */
const idOf = (req) => String(req.params.id);

export function courtCasesRoutes() {
  const router = Router();
  const view = requirePermission("court.view");
  const record = requirePermission("court.record");
  const approve = requirePermission("court.confirmReferral");

  router.get("/", view, query(listSchema), async (req, res) => {
    res.json(await listCourtCases(actor(req), req.validQuery));
  });
  router.get("/:id", view, async (req, res) => {
    res.json(await getCourtCase(actor(req), idOf(req)));
  });
  router.get("/:id/bundle", view, async (req, res) => {
    res.json(await evidenceBundle(actor(req), idOf(req), ctx(req)));
  });
  router.post("/:id/prepare", record, body(prepareSchema), async (req, res) => {
    res.json(await prepareCourtCase(actor(req), idOf(req), req.body, ctx(req)));
  });
  router.post("/:id/approve", approve, async (req, res) => {
    res.json(await approveFiling(actor(req), idOf(req), ctx(req)));
  });
  router.post("/:id/file", record, body(fileSchema), async (req, res) => {
    res.json(await fileCourtCase(actor(req), idOf(req), req.body, ctx(req)));
  });
  router.post("/:id/hearings", record, body(hearingSchema), async (req, res) => {
    res.json(await recordHearing(actor(req), idOf(req), req.body, ctx(req)));
  });
  router.post("/:id/verdict", record, body(verdictSchema), async (req, res) => {
    res.json(await recordVerdict(actor(req), idOf(req), req.body, ctx(req)));
  });
  router.post("/:id/verdict/confirm", approve, async (req, res) => {
    res.json(await confirmVerdict(actor(req), idOf(req), ctx(req)));
  });
  router.post("/:id/withdraw", approve, body(z.object({ reason })), async (req, res) => {
    res.json(await withdrawCourtCase(actor(req), idOf(req), req.body.reason, ctx(req)));
  });
  router.post("/:id/appeal", record, body(appealSchema), async (req, res) => {
    res.json(await recordAppeal(actor(req), idOf(req), req.body, ctx(req)));
  });
  router.post("/:id/appeal/result", approve, body(appealResultSchema), async (req, res) => {
    res.json(await decideAppeal(actor(req), idOf(req), req.body, ctx(req)));
  });
  return router;
}

export function courtsRoutes() {
  const router = Router();
  const manage = requirePermission("stations.manage");
  // Anyone who works with court cases or stations reads the list.
  router.get("/", signedIn(), async (req, res) => {
    const a = actor(req);
    if (!scopeOf(a.role, "court.view") && !scopeOf(a.role, "stations.manage")) throw forbidden();
    res.json(await listCourts(scopeOf(a.role, "stations.manage") === "N"));
  });
  router.post("/", manage, body(courtSchema), async (req, res) => {
    res.status(201).json(await saveCourt(actor(req), req.body, ctx(req)));
  });
  router.put("/:id", manage, body(courtSchema), async (req, res) => {
    res.json(await saveCourt(actor(req), req.body, ctx(req), idOf(req)));
  });
  router.put(
    "/stations/:stationId",
    manage,
    body(z.object({ courtId: z.string().trim().nullable() })),
    async (req, res) => {
      res.json(
        await setStationCourt(actor(req), String(req.params.stationId), req.body.courtId, ctx(req)),
      );
    },
  );
  return router;
}

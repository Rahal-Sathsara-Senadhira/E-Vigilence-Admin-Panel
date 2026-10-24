// /api/v1/cases — docs/03: queues, the case record, dispatch, accept and
// return, the investigating officer, notes.

import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "#src/core/access/guards.js";
import { scopeOf } from "#src/core/access/permissions.js";
import { notFound } from "#src/core/errors.js";
import { body, query } from "#src/core/http/validate.js";
import { Station } from "../organisation/organisation.model.js";
import { Case } from "./case.model.js";
import {
  acceptCase,
  addNote,
  assignOfficer,
  dispatchCase,
  getCase,
  listCases,
  officersFor,
  returnCase,
  stationChoices,
} from "./cases.service.js";
import { receiveUpload } from "../evidence/index.js";
import { NFA_REASONS, OUTCOME_TYPES } from "./case.model.js";
import { decide, mergeCase, overrideDecision, recommend, reopenCase } from "./outcomes.js";
import {
  REVIEW_ITEMS,
  addCaseEvidence,
  addStatement,
  reuseTrace,
  saveReview,
  setDriver,
  traceVehicle,
  vehicleCheck,
} from "./investigation.js";

const lookupSchema = z.object({
  number: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^TC-\d{4}-\d{6}$/, "Enter a case number like TC-2026-000123."),
});
const listSchema = z.object({
  view: z
    .enum([
      "not_dispatched",
      "returned",
      "awaiting_acceptance",
      "to_accept",
      "needs_officer",
      "to_decide",
      "mine",
      "active",
      "closed",
      "all",
    ])
    .default("all"),
  q: z.string().trim().max(100).optional(),
  priority: z.enum(["P1", "P2", "P3"]).optional(),
  stationId: z.string().trim().max(30).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const dispatchSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("auto"), reason: z.string().trim().max(500).optional() }),
  z.object({
    mode: z.literal("manual"),
    stationId: z.string().trim().min(1, "Choose a station."),
    reason: z.string().trim().min(5, "Say why you chose this station.").max(500),
  }),
]);
const returnSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Say why this isn't your station's case (10 characters or more).")
    .max(1000),
});
const assignSchema = z.object({
  officerId: z.string().trim().min(1, "Choose an officer."),
  note: z.string().trim().max(500).optional(),
});
const notFuture = (/** @type {string} */ what) =>
  z.coerce
    .date()
    .refine((d) => d.getTime() <= Date.now() + 60_000, `${what} can't be in the future.`);
const traceSchema = z.object({
  plate: z.string().trim().max(20).optional(),
  vehicleType: z
    .enum(["motorcycle", "three_wheeler", "car", "van", "bus", "lorry", "tractor", "other"])
    .optional(),
  make: z.string().trim().max(60).optional(),
  model: z.string().trim().max(60).optional(),
  colour: z.string().trim().max(40).optional(),
  ownerId: z.string().trim().min(1, "Choose the registered owner."),
  ownerFrom: notFuture("The ownership date"),
  dmtReference: z.string().trim().min(2, "Enter the registry (DMT) reference.").max(80),
  checkedOn: notFuture("The check date"),
});
const driverSchema = z.object({
  personId: z.string().trim().min(1, "Choose the driver."),
  basis: z.enum(["stopped", "evidence", "statement", "named_by_owner"]),
  note: z.string().trim().max(500).optional(),
});
const reviewSchema = z.object({
  ...Object.fromEntries(REVIEW_ITEMS.map((k) => [k, z.boolean({ error: "Answer yes or no." })])),
  note: z.string().trim().max(1000).optional(),
});
const statementSchema = z.object({
  role: z.enum(["owner", "driver", "witness"]),
  personId: z.string().trim().optional(),
  name: z.string().trim().max(150).optional(),
  takenAt: notFuture("The statement date"),
  summary: z.string().trim().min(10, "Summarise the statement (10 characters or more).").max(4000),
  evidenceId: z.string().trim().optional(),
});
const outcomeFields = {
  outcome: z.enum(OUTCOME_TYPES),
  offenceCodes: z.array(z.string().trim().toUpperCase()).max(10).optional(),
  addressee: z.enum(["owner", "driver"]).optional(),
  driverUnknownReason: z.string().trim().min(5).max(500).optional(),
  prosecutionSummary: z.string().trim().min(10).max(4000).optional(),
  nfaReason: z.enum(NFA_REASONS).optional(),
};
const recommendSchema = z.object({
  ...outcomeFields,
  justification: z
    .string()
    .trim()
    .min(10, "Explain the recommendation (10 characters or more).")
    .max(2000),
});
const reasonText = z.string().trim().min(10, "Give the reason (10 characters or more).").max(1000);
const decideSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("send_back"), reason: reasonText }),
  z.object({ action: z.literal("change"), reason: reasonText, ...outcomeFields }),
]);
const reasonSchema = z.object({ reason: reasonText });
const mergeSchema = z.object({
  intoCaseNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^TC-\d{4}-\d{6}$/, "Enter a case number like TC-2026-000123."),
  reason: reasonText,
});
const noteSchema = z.object({
  text: z.string().trim().min(2, "Write the note.").max(4000),
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

/** @param {import("#src/core/storage.js").Storage} storage */
export function casesRoutes(storage) {
  const router = Router();
  const view = requirePermission("cases.view");

  // By number, for merging a report into a case.
  router.get("/lookup", view, query(lookupSchema), async (req, res) => {
    const a = actor(req);
    const scope = scopeOf(a.role, "cases.view");
    /** @type {any} */
    const filter = { caseNumber: req.validQuery.number };
    if (scope === "S") filter.stationId = a.stationId;
    if (scope === "D")
      filter.stationId = { $in: await Station.find({ divisionId: a.divisionId }).distinct("_id") };
    const c = await Case.findOne(filter).lean();
    if (!c) throw notFound("No case with that number.");
    res.json({
      id: String(c._id),
      caseNumber: c.caseNumber,
      status: c.status,
      vehicleNumber: c.facts.vehicleNumber,
      occurredAt: c.facts.occurredAt.toISOString(),
    });
  });

  router.get("/", view, query(listSchema), async (req, res) => {
    res.json(await listCases(actor(req), req.validQuery));
  });
  router.get("/:id", view, async (req, res) => {
    res.json(await getCase(actor(req), idOf(req)));
  });
  router.get("/:id/officers", requirePermission("cases.assignOfficer"), async (req, res) => {
    res.json(await officersFor(actor(req), idOf(req)));
  });
  router.get(
    "/:id/stations",
    requirePermission("cases.dispatch"),
    query(z.object({ q: z.string().trim().max(100).optional() })),
    async (req, res) => {
      res.json(await stationChoices(actor(req), idOf(req), req.validQuery.q));
    },
  );
  router.post(
    "/:id/dispatch",
    requirePermission("cases.dispatch"),
    body(dispatchSchema),
    async (req, res) => {
      res.json(await dispatchCase(actor(req), idOf(req), req.body, ctx(req)));
    },
  );
  router.post("/:id/accept", requirePermission("cases.acceptReturn"), async (req, res) => {
    res.json(await acceptCase(actor(req), idOf(req), ctx(req)));
  });
  router.post(
    "/:id/return",
    requirePermission("cases.acceptReturn"),
    body(returnSchema),
    async (req, res) => {
      res.json(await returnCase(actor(req), idOf(req), req.body.reason, ctx(req)));
    },
  );
  router.post(
    "/:id/officer",
    requirePermission("cases.assignOfficer"),
    body(assignSchema),
    async (req, res) => {
      res.json(await assignOfficer(actor(req), idOf(req), req.body, ctx(req)));
    },
  );
  // Who may write is decided per case (officer, OIC, HQ) — see cases.service.
  router.post("/:id/notes", view, body(noteSchema), async (req, res) => {
    res.json(await addNote(actor(req), idOf(req), req.body.text, ctx(req)));
  });
  // Investigation (docs/04 §6) — the investigating officer and the OIC.
  const investigate = requirePermission("cases.investigate");
  router.get("/:id/vehicle-check", view, async (req, res) => {
    res.json(await vehicleCheck(actor(req), idOf(req)));
  });
  router.post("/:id/trace", investigate, body(traceSchema), async (req, res) => {
    res.json(await traceVehicle(actor(req), idOf(req), req.body, ctx(req)));
  });
  router.post("/:id/trace/reuse", investigate, async (req, res) => {
    res.json(await reuseTrace(actor(req), idOf(req), ctx(req)));
  });
  router.post("/:id/driver", investigate, body(driverSchema), async (req, res) => {
    res.json(await setDriver(actor(req), idOf(req), req.body, ctx(req)));
  });
  router.put("/:id/review", investigate, body(reviewSchema), async (req, res) => {
    res.json(await saveReview(actor(req), idOf(req), req.body, ctx(req)));
  });
  router.post("/:id/statements", investigate, body(statementSchema), async (req, res) => {
    res.json(await addStatement(actor(req), idOf(req), req.body, ctx(req)));
  });
  router.post("/:id/evidence", investigate, async (req, res) => {
    const file = await receiveUpload(req);
    res.status(201).json(await addCaseEvidence(actor(req), idOf(req), file, storage, ctx(req)));
  });
  // Outcome (docs/05 §3, §4) and HQ's changes (docs/03 §7, §8).
  router.post(
    "/:id/recommend",
    requirePermission("cases.recommend"),
    body(recommendSchema),
    async (req, res) => {
      res.json(await recommend(actor(req), idOf(req), req.body, ctx(req)));
    },
  );
  router.post(
    "/:id/decide",
    requirePermission("cases.decide"),
    body(decideSchema),
    async (req, res) => {
      res.json(await decide(actor(req), idOf(req), req.body, ctx(req)));
    },
  );
  router.post(
    "/:id/override",
    requirePermission("cases.override"),
    body(reasonSchema),
    async (req, res) => {
      res.json(await overrideDecision(actor(req), idOf(req), req.body.reason, ctx(req)));
    },
  );
  router.post(
    "/:id/reopen",
    requirePermission("cases.override"),
    body(reasonSchema),
    async (req, res) => {
      res.json(await reopenCase(actor(req), idOf(req), req.body.reason, ctx(req)));
    },
  );
  router.post(
    "/:id/merge",
    requirePermission("cases.dispatch"),
    body(mergeSchema),
    async (req, res) => {
      res.json(await mergeCase(actor(req), idOf(req), req.body, ctx(req)));
    },
  );
  return router;
}

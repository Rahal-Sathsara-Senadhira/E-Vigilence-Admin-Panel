// /api/v1/rewards — docs/16. Seen by HQ and finance (rewards.view); rules
// changed by HQ administrators (rewards.manageRules); holds, reversals and
// account freezes by HQ supervisors (rewards.review); payout batches by
// finance (rewards.approvePayouts).

import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "#src/core/access/guards.js";
import { body, query } from "#src/core/http/validate.js";
import {
  getAccount,
  getEntry,
  holdEntry,
  listEntries,
  releaseHold,
  reverseByHq,
  setAccountRewards,
} from "./rewards.service.js";
import {
  approveBatch,
  cancelBatch,
  getBatch,
  listBatches,
  listPayouts,
  prepareBatch,
  rejectPayout,
  retryPayout,
  rewardTotals,
} from "./payouts.js";
import { listRules, setRules } from "./rules.js";

const listSchema = z.object({
  view: z
    .enum(["held", "pending", "confirmed", "paid", "reversed", "not_eligible", "expired", "all"])
    .default("all"),
  q: z.string().trim().max(60).optional(),
  userId: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const reason = z.string().trim().min(10, "Give the reason (10 characters or more).").max(1000);
const points = z.coerce.number().int().min(0).max(1000);
const rulesSchema = z.object({
  severityPoints: z.object({ minor: points, moderate: points, severe: points }),
  offencePoints: z
    .array(z.object({ code: z.string().trim().min(1).max(30), points }))
    .max(500)
    .refine((list) => new Set(list.map((o) => o.code)).size === list.length, {
      message: "Each offence once.",
    }),
  warningPoints: points,
  rupeesPer100Points: z.coerce.number().int().min(1).max(100_000),
  minPayoutPoints: z.coerce.number().int().min(1).max(100_000),
  monthlyCapRupees: z.coerce.number().int().min(0).max(10_000_000),
  dailyEarningReports: z.coerce.number().int().min(1).max(100),
  reason,
});
const accountSchema = z.object({ frozen: z.boolean(), excluded: z.boolean(), reason });
const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};
const pageSchema = z.object(page);
const payoutListSchema = z.object({
  view: z.enum(["requested", "batched", "paid", "failed", "rejected", "all"]).default("requested"),
  userId: z.string().trim().max(60).optional(),
  ...page,
});
const batchSchema = z.object({
  payoutIds: z
    .array(z.string().regex(/^[a-f0-9]{24}$/i, "Not a payout."))
    .max(1000)
    .optional(),
});
const totalsSchema = z.object({ months: z.coerce.number().int().min(1).max(24).default(6) });

/** @param {import("express").Request} req */
const actor = (req) => /** @type {NonNullable<typeof req.auth>} */ (req.auth);
/** @param {import("express").Request} req */
const ctx = (req) => ({ ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null });

export function rewardsRoutes() {
  const router = Router();
  const view = requirePermission("rewards.view");
  const review = requirePermission("rewards.review");

  router.get("/", view, query(listSchema), async (req, res) => {
    res.json(await listEntries(req.validQuery));
  });

  // Payouts (§6) — before "/:id". Finance prepares and approves batches.
  const pay = requirePermission("rewards.approvePayouts");
  router.get("/payouts", view, query(payoutListSchema), async (req, res) => {
    res.json(await listPayouts(req.validQuery));
  });
  router.post("/payouts/:id/retry", pay, async (req, res) => {
    res.json(await retryPayout(actor(req), String(req.params.id), ctx(req)));
  });
  router.post("/payouts/:id/reject", pay, body(z.object({ reason })), async (req, res) => {
    res.json(await rejectPayout(actor(req), String(req.params.id), req.body.reason, ctx(req)));
  });
  router.get("/batches", view, query(pageSchema), async (req, res) => {
    res.json(await listBatches(req.validQuery));
  });
  router.post("/batches", pay, body(batchSchema), async (req, res) => {
    res.status(201).json(await prepareBatch(actor(req), req.body, ctx(req)));
  });
  router.get("/batches/:id", view, async (req, res) => {
    res.json(await getBatch(String(req.params.id)));
  });
  router.post("/batches/:id/approve", pay, async (req, res) => {
    res.json(await approveBatch(actor(req), String(req.params.id), ctx(req)));
  });
  router.post("/batches/:id/cancel", pay, async (req, res) => {
    res.json(await cancelBatch(actor(req), String(req.params.id), ctx(req)));
  });
  router.get("/totals", view, query(totalsSchema), async (req, res) => {
    res.json(await rewardTotals(req.validQuery.months));
  });
  router.get("/rules", view, async (_req, res) => {
    res.json(await listRules());
  });
  router.put(
    "/rules",
    requirePermission("rewards.manageRules"),
    body(rulesSchema),
    async (req, res) => {
      res.json(await setRules(actor(req), req.body, ctx(req)));
    },
  );
  router.get("/accounts/:userId", view, async (req, res) => {
    res.json(await getAccount(String(req.params.userId)));
  });
  router.put("/accounts/:userId", review, body(accountSchema), async (req, res) => {
    res.json(await setAccountRewards(actor(req), String(req.params.userId), req.body, ctx(req)));
  });
  router.get("/:id", view, async (req, res) => {
    res.json(await getEntry(String(req.params.id)));
  });
  router.post("/:id/hold", review, body(z.object({ reason })), async (req, res) => {
    res.json(await holdEntry(actor(req), String(req.params.id), req.body.reason, ctx(req)));
  });
  router.post("/:id/release", review, body(z.object({ reason })), async (req, res) => {
    res.json(await releaseHold(actor(req), String(req.params.id), req.body.reason, ctx(req)));
  });
  router.post("/:id/reverse", review, body(z.object({ reason })), async (req, res) => {
    res.json(await reverseByHq(actor(req), String(req.params.id), req.body.reason, ctx(req)));
  });
  return router;
}

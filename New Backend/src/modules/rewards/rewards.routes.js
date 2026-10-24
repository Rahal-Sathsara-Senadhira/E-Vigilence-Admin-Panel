// /api/v1/rewards — docs/16. Seen by HQ and finance (rewards.view); rules
// changed by HQ administrators (rewards.manageRules); holds, reversals and
// account freezes by HQ supervisors (rewards.review).

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

// /api/v1/demerit — docs/08. The settings are read by everyone who reads the
// offence schedule and changed by HQ administrators (demerit.manage); a
// person's points are read under the same rule as the person (§8); HQ
// supervisors record referrals to the DMT (demerit.refer).

import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "#src/core/access/guards.js";
import { body, query } from "#src/core/http/validate.js";
import {
  listSettings,
  listStandings,
  personPoints,
  recordReferral,
  setSettings,
} from "./demerit.service.js";

const threshold = z.coerce.number().int().min(1).max(100);
const settingsSchema = z
  .object({
    enabled: z.boolean(),
    warnAt: threshold,
    referAt: threshold,
    reason: z.string().trim().min(10, "Give the reason (10 characters or more).").max(1000),
  })
  .refine((v) => v.warnAt < v.referAt, {
    message: "The warning comes before the referral threshold.",
    path: ["warnAt"],
  });
const referralSchema = z.object({
  reference: z.string().trim().min(2, "Enter the DMT reference.").max(60),
  referredOn: z.coerce
    .date({ error: "Enter the date." })
    .refine((d) => d.getTime() <= Date.now() + 86_400_000, "The date can't be in the future."),
});
const standingsSchema = z.object({
  flag: z.enum(["approaching", "threshold"]).default("threshold"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** @param {import("express").Request} req */
const actor = (req) => /** @type {NonNullable<typeof req.auth>} */ (req.auth);
/** @param {import("express").Request} req */
const ctx = (req) => ({ ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null });

export function demeritRoutes() {
  const router = Router();
  router.get("/settings", requirePermission("offences.view"), async (_req, res) => {
    res.json(await listSettings());
  });
  router.put(
    "/settings",
    requirePermission("demerit.manage"),
    body(settingsSchema),
    async (req, res) => {
      res.json(await setSettings(actor(req), req.body, ctx(req)));
    },
  );
  router.get(
    "/standings",
    requirePermission("demerit.refer"),
    query(standingsSchema),
    async (req, res) => {
      res.json(await listStandings(req.validQuery));
    },
  );
  router.get("/persons/:id", requirePermission("persons.view"), async (req, res) => {
    res.json(await personPoints(actor(req), String(req.params.id)));
  });
  router.post(
    "/persons/:id/referral",
    requirePermission("demerit.refer"),
    body(referralSchema),
    async (req, res) => {
      res.json(await recordReferral(actor(req), String(req.params.id), req.body, ctx(req)));
    },
  );
  return router;
}

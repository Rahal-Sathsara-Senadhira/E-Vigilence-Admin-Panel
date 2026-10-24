// /api/v1/reporters — mobile-app reporters' standing (docs/02 §10).
// HQ supervisors only: suspending someone from reporting is a step above
// triage (docs/20 §5.1).

import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "#src/core/access/guards.js";
import { body, query } from "#src/core/http/validate.js";
import {
  getReporter,
  listReporters,
  reinstateReporter,
  suspendReporter,
} from "./reporters.service.js";

const listSchema = z.object({ status: z.enum(["flagged", "suspended"]).optional() });
const reasonSchema = z.object({
  reason: z.string().trim().min(10, "Give the reason (10 characters or more).").max(500),
});

/** @param {import("express").Request} req */
const ctx = (req) => ({
  ip: req.ip ?? null,
  userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
});
/** @param {import("express").Request} req */
const actor = (req) => /** @type {NonNullable<typeof req.auth>} */ (req.auth);
/** The app's account id: kept as text, never used as a query operator. @param {import("express").Request} req */
const userIdOf = (req) => String(req.params.userId).slice(0, 64);

export function reportersRoutes() {
  const router = Router();
  const manage = requirePermission("reporters.suspend");

  router.get("/", manage, query(listSchema), async (req, res) => {
    res.json(await listReporters(req.validQuery));
  });
  router.get("/:userId", manage, async (req, res) => {
    res.json(await getReporter(userIdOf(req)));
  });
  router.post("/:userId/suspend", manage, body(reasonSchema), async (req, res) => {
    res.json(await suspendReporter(actor(req), userIdOf(req), req.body.reason, ctx(req)));
  });
  router.post("/:userId/reinstate", manage, body(reasonSchema), async (req, res) => {
    res.json(await reinstateReporter(actor(req), userIdOf(req), req.body.reason, ctx(req)));
  });
  return router;
}

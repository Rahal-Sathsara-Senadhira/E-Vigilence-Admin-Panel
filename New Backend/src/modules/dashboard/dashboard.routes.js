// /api/v1/dashboard — docs/12. Everyone with a dashboard permission gets the
// one for their role; the service decides which and its scope (D5).

import { Router } from "express";
import { z } from "zod";
import { signedIn } from "#src/core/access/guards.js";
import { query } from "#src/core/http/validate.js";
import { dashboardFor } from "./dashboard.service.js";
import { PERIODS } from "./period.js";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-24.");
const dashboardSchema = z.object({
  period: z.enum(PERIODS).default("30d"),
  from: ymd.optional(),
  to: ymd.optional(),
  divisionId: z.string().trim().max(30).optional(),
  stationId: z.string().trim().max(30).optional(),
  channel: z.enum(["app", "walk_in", "hotline", "other"]).optional(),
  priority: z.enum(["P1", "P2", "P3"]).optional(),
});

/** @param {import("express").Request} req */
const actor = (req) => /** @type {NonNullable<typeof req.auth>} */ (req.auth);

export function dashboardRoutes() {
  const router = Router();
  router.get("/", signedIn(), query(dashboardSchema), async (req, res) => {
    res.json(await dashboardFor(actor(req), req.validQuery));
  });
  return router;
}

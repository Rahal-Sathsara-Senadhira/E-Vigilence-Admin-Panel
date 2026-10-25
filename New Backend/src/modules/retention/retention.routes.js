// /api/v1/retention — docs/10 §6. HQ administrators (retention.manage)
// preview what is due, turn retention on after the legal review, and run it.

import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "#src/core/access/guards.js";
import { body } from "#src/core/http/validate.js";
import { configureRetention, overview, runRetention, setRetention } from "./retention.service.js";

const settingsSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().min(10, "Give the reason (10 characters or more).").max(1000),
});

/** @param {import("express").Request} req */
const actor = (req) => /** @type {NonNullable<typeof req.auth>} */ (req.auth);
/** @param {import("express").Request} req */
const ctx = (req) => ({ ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null });

/** @param {import("#src/core/storage.js").Storage} storage */
export function retentionRoutes(storage) {
  configureRetention(storage);
  const router = Router();
  const manage = requirePermission("retention.manage");
  router.get("/", manage, async (_req, res) => {
    res.json(await overview());
  });
  router.put("/settings", manage, body(settingsSchema), async (req, res) => {
    res.json(await setRetention(actor(req), req.body, ctx(req)));
  });
  router.post("/run", manage, async (req, res) => {
    await runRetention({ trigger: "manual", by: actor(req).name });
    res.json(await overview());
  });
  return router;
}

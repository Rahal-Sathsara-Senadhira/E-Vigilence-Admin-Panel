// /api/v1/audit — read-only.

import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "#src/core/access/guards.js";
import { query } from "#src/core/http/validate.js";
import { CATEGORIES, auditIntegrity, listAudit } from "./audit.service.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const listSchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.enum(/** @type {[string, ...string[]]} */ (Object.keys(CATEGORIES))).optional(),
  actorId: objectId.optional(),
  targetType: z.string().trim().max(20).optional(),
  targetId: z.string().trim().max(40).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

/** @param {import("express").Request} req */
const actor = (req) => /** @type {NonNullable<typeof req.auth>} */ (req.auth);

export function auditRoutes() {
  const router = Router();
  const view = requirePermission("audit.view");
  router.get("/", view, query(listSchema), async (req, res) => {
    res.json(await listAudit(actor(req), req.validQuery));
  });
  router.get("/integrity", view, async (req, res) => {
    res.json(await auditIntegrity(actor(req)));
  });
  return router;
}

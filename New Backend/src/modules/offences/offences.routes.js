// /api/v1/offences — the offence schedule.

import { Router } from "express";
import { requirePermission } from "#src/core/access/guards.js";
import { body, query } from "#src/core/http/validate.js";
import { changeSchema, createSchema, listSchema } from "./offences.schemas.js";
import { changeOffence, createOffence, getOffence, listOffences } from "./offences.service.js";

/** @param {import("express").Request} req */
const ctx = (req) => ({
  ip: req.ip ?? null,
  userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
});
/** @param {import("express").Request} req */
const actor = (req) => /** @type {NonNullable<typeof req.auth>} */ (req.auth);

export function offencesRoutes() {
  const router = Router();
  const view = requirePermission("offences.view");
  const manage = requirePermission("offences.manage");
  router.get("/", view, query(listSchema), async (req, res) => {
    res.json(await listOffences(req.validQuery));
  });
  router.get("/:code", view, async (req, res) => {
    res.json(await getOffence(String(req.params.code)));
  });
  router.post("/", manage, body(createSchema), async (req, res) => {
    res.status(201).json(await createOffence(actor(req), req.body, ctx(req)));
  });
  router.post("/:code/versions", manage, body(changeSchema), async (req, res) => {
    res.json(await changeOffence(actor(req), String(req.params.code), req.body, ctx(req)));
  });
  return router;
}

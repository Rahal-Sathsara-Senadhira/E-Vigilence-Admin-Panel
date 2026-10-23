// /api/v1/users — staff accounts (docs/20 §6). HTTP in and out only; the
// rules are in users.service.js and users.policy.js.

import { Router } from "express";
import { requirePermission } from "#src/core/access/guards.js";
import { body, query } from "#src/core/http/validate.js";
import {
  accountOptions,
  createAccount,
  deactivateAccount,
  getAccount,
  listAccounts,
  reactivateAccount,
  resetPassword,
  resetTwoStep,
  unlockAccount,
  updateAccount,
} from "./users.service.js";
import {
  createUserSchema,
  listQuerySchema,
  reasonSchema,
  updateUserSchema,
} from "./users.schemas.js";

/** @param {import("express").Request} req */
const ctx = (req) => ({
  ip: req.ip ?? null,
  userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
});
/** @param {import("express").Request} req */
const actor = (req) => /** @type {NonNullable<typeof req.auth>} */ (req.auth);
/** @param {import("express").Request} req */
const idOf = (req) => String(req.params.id);

export function usersRoutes() {
  const router = Router();
  const view = requirePermission("users.view");
  const manage = requirePermission("users.manage");

  router.get("/", view, query(listQuerySchema), async (req, res) => {
    res.json(await listAccounts(actor(req), req.validQuery));
  });
  router.get("/options", manage, async (req, res) => {
    res.json(await accountOptions(actor(req)));
  });
  router.get("/:id", view, async (req, res) => {
    res.json(await getAccount(actor(req), idOf(req)));
  });
  router.post("/", manage, body(createUserSchema), async (req, res) => {
    res.status(201).json(await createAccount(actor(req), req.body, ctx(req)));
  });
  router.put("/:id", manage, body(updateUserSchema), async (req, res) => {
    res.json(await updateAccount(actor(req), idOf(req), req.body, ctx(req)));
  });
  router.post("/:id/deactivate", manage, body(reasonSchema), async (req, res) => {
    res.json(await deactivateAccount(actor(req), idOf(req), req.body.reason, ctx(req)));
  });
  router.post("/:id/reactivate", manage, async (req, res) => {
    res.json(await reactivateAccount(actor(req), idOf(req), ctx(req)));
  });
  router.post("/:id/reset-password", manage, async (req, res) => {
    res.json(await resetPassword(actor(req), idOf(req), ctx(req)));
  });
  router.post("/:id/reset-two-step", manage, body(reasonSchema), async (req, res) => {
    res.json(await resetTwoStep(actor(req), idOf(req), req.body.reason, ctx(req)));
  });
  router.post("/:id/unlock", manage, async (req, res) => {
    res.json(await unlockAccount(actor(req), idOf(req), ctx(req)));
  });

  return router;
}

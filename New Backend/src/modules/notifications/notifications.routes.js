// /api/v1/notifications and /api/v1/overdue — docs/09. Everyone signed in
// has their own notifications; the overdue list is limited to their area.

import { Router } from "express";
import { z } from "zod";
import { signedIn } from "#src/core/access/guards.js";
import { query } from "#src/core/http/validate.js";
import {
  listNotifications,
  listOverdue,
  markAllRead,
  markRead,
  unreadCount,
} from "./notifications.service.js";

const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
const listSchema = z.object({
  unread: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  ...page,
});
const overdueSchema = z.object({
  limitKey: z.string().trim().max(60).optional(),
  ...page,
});

/** @param {import("express").Request} req */
const actor = (req) => /** @type {NonNullable<typeof req.auth>} */ (req.auth);

export function notificationsRoutes() {
  const router = Router();
  router.get("/", signedIn(), query(listSchema), async (req, res) => {
    res.json(await listNotifications(actor(req), req.validQuery));
  });
  router.get("/unread", signedIn(), async (req, res) => {
    res.json({ unread: await unreadCount(actor(req)) });
  });
  router.post("/read-all", signedIn(), async (req, res) => {
    res.json(await markAllRead(actor(req)));
  });
  router.post("/:id/read", signedIn(), async (req, res) => {
    res.json(await markRead(actor(req), String(req.params.id)));
  });
  return router;
}

export function overdueRoutes() {
  const router = Router();
  router.get("/", signedIn(), query(overdueSchema), async (req, res) => {
    res.json(await listOverdue(actor(req), req.validQuery));
  });
  return router;
}

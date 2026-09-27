import asyncHandler from "../../utils/asyncHandler.js";
import * as svc from "./notifications.service.js";

// Notifications are private to their recipient. Only hq may act on behalf of
// another user (e.g. to inspect/address a specific station user); everyone
// else is pinned to their own req.user.id regardless of what's in the
// query/body.
function targetUserId(req) {
  const isHQ = req.user?.role === "hq";
  const requested = req.query.user_id ?? req.body?.user_id;
  return isHQ && requested ? requested : req.user?.id;
}

function ownerFilter(req) {
  return req.user?.role === "hq" ? {} : { user_id: req.user?.id };
}

export const list = asyncHandler(async (req, res) => {
  const items = await svc.list({ user_id: targetUserId(req) });
  res.json(items);
});

export const create = asyncHandler(async (req, res) => {
  const created = await svc.create({ ...req.body, user_id: targetUserId(req) });
  res.status(201).json(created);
});

export const markRead = asyncHandler(async (req, res) => {
  const updated = await svc.markRead(req.params.id, ownerFilter(req));
  res.json(updated);
});

export const remove = asyncHandler(async (req, res) => {
  await svc.remove(req.params.id, ownerFilter(req));
  res.json({ ok: true });
});

export const unreadCount = asyncHandler(async (req, res) => {
  const count = await svc.unreadCount(targetUserId(req));
  res.json({ count });
});

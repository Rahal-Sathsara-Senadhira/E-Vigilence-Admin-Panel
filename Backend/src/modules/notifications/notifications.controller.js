import asyncHandler from "../../utils/asyncHandler.js";
import * as svc from "./notifications.service.js";

export const list = asyncHandler(async (req, res) => {
  const items = await svc.list({ user_id: req.query.user_id });
  res.json(items);
});

export const create = asyncHandler(async (req, res) => {
  const created = await svc.create(req.body);
  res.status(201).json(created);
});

export const markRead = asyncHandler(async (req, res) => {
  const updated = await svc.markRead(req.params.id);
  res.json(updated);
});

export const remove = asyncHandler(async (req, res) => {
  await svc.remove(req.params.id);
  res.json({ ok: true });
});

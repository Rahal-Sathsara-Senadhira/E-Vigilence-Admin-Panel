import asyncHandler from "../../utils/asyncHandler.js";
import * as svc from "./regionalStations.service.js";

export const list = asyncHandler(async (req, res) => {
  const items = await svc.list();
  res.json(items);
});

export const getById = asyncHandler(async (req, res) => {
  const item = await svc.getById(req.params.id);
  res.json(item);
});

export const create = asyncHandler(async (req, res) => {
  const created = await svc.create(req.body);
  res.status(201).json(created);
});

export const update = asyncHandler(async (req, res) => {
  const updated = await svc.update(req.params.id, req.body);
  res.json(updated);
});

export const remove = asyncHandler(async (req, res) => {
  await svc.remove(req.params.id);
  res.json({ ok: true });
});

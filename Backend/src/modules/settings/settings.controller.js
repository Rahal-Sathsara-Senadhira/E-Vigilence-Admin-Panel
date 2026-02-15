import asyncHandler from "../../utils/asyncHandler.js";
import * as svc from "./settings.service.js";

export const list = asyncHandler(async (req, res) => {
  const items = await svc.list();
  res.json(items);
});

export const getByKey = asyncHandler(async (req, res) => {
  const item = await svc.getByKey(req.params.key);
  res.json(item);
});

export const upsert = asyncHandler(async (req, res) => {
  const saved = await svc.upsert(req.params.key, req.body.value);
  res.json(saved);
});

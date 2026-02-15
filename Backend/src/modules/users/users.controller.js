import asyncHandler from "../../utils/asyncHandler.js";
import * as svc from "./users.service.js";
import { validateCreate } from "./users.validation.js";
import { HttpError } from "../../utils/httpError.js";

export const list = asyncHandler(async (req, res) => {
  const items = await svc.list();
  res.json(items);
});

export const getById = asyncHandler(async (req, res) => {
  const item = await svc.getById(req.params.id);
  res.json(item);
});

export const create = asyncHandler(async (req, res) => {
  const errors = validateCreate(req.body);
  if (errors.length) throw new HttpError(400, errors.join(", "));

  const created = await svc.create({
    full_name: req.body.full_name,
    email: req.body.email,
    phone_number: req.body.phone_number || null,
    nic_number: req.body.nic_number || null,
    role: req.body.role || "user",
    station_id: req.body.station_id || null,
    is_active: req.body.is_active ?? true,
  });

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

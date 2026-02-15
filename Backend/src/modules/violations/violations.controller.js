import asyncHandler from "../../utils/asyncHandler.js";
import * as svc from "./violations.service.js";
import { validateCreate } from "./violations.validation.js";
import { HttpError } from "../../utils/httpError.js";
import { parseDms } from "../../utils/parseDms.js";

export const list = asyncHandler(async (req, res) => {
  const items = await svc.list({
    type: req.query.type,
    status: req.query.status,
    q: req.query.q,
  });
  res.json(items);
});

export const getById = asyncHandler(async (req, res) => {
  const item = await svc.getById(req.params.id);
  res.json(item);
});

export const create = asyncHandler(async (req, res) => {
  const errors = validateCreate(req.body);
  if (errors.length) throw new HttpError(400, errors.join(", "));

  let location = req.body.location;

  if (!location && req.body.dms) {
    const parsed = parseDms(req.body.dms);
    if (!parsed) throw new HttpError(400, "Invalid DMS format");
    location = { ...parsed, dms: req.body.dms };
  }

  const created = await svc.create({
    title: req.body.title,
    type: req.body.type,
    description: req.body.description || "",
    location,
    reported_by: req.body.reported_by || null,
    status: req.body.status || "pending",
    images: Array.isArray(req.body.images) ? req.body.images : [],
  });

  res.status(201).json(created);
});

export const remove = asyncHandler(async (req, res) => {
  await svc.remove(req.params.id);
  res.json({ ok: true });
});

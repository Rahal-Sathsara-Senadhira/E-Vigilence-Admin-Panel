import asyncHandler from "../../utils/asyncHandler.js";
import * as svc from "./violations.service.js";
import { validateCreate } from "./violations.validation.js";
import { HttpError } from "../../utils/httpError.js";
import { parseDms } from "../../utils/parseDms.js";

function normalizeStatus(input) {
  if (!input) return "open";
  const s = String(input).toLowerCase();

  const map = {
    pending: "open",
    verified: "resolved",
    rejected: "resolved",
    open: "open",
    in_review: "in_review",
    resolved: "resolved",
  };

  return map[s] || "open";
}

function normalizeViolations(v) {
  if (!Array.isArray(v)) return [];
  // trim + remove empty + remove duplicates (case-insensitive)
  const seen = new Set();
  const out = [];
  for (const item of v) {
    const val = String(item ?? "").trim();
    if (!val) continue;
    const key = val.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(val);
  }
  return out;
}

export const list = asyncHandler(async (req, res) => {
  const type = req.query.type ?? req.query.category;

  const result = await svc.list({
    type: type || undefined,
    status: req.query.status || undefined,
    q: req.query.q || undefined,
    limit: req.query.limit ?? 50,
    offset: req.query.offset ?? 0,
  });

  res.json(result);
});

export const getById = asyncHandler(async (req, res) => {
  const item = await svc.getById(req.params.id);
  res.json(item);
});

export const create = asyncHandler(async (req, res) => {
  const errors = validateCreate(req.body);
  if (errors.length) throw new HttpError(400, errors.join(", "));

  const type = req.body.type ?? req.body.category;
  const dmsText = req.body.dms ?? req.body.locationText;

  let location = req.body.location;

  if (!location && dmsText) {
    const parsed = parseDms(dmsText);
    if (!parsed) throw new HttpError(400, "Invalid DMS format");
    location = { ...parsed, dms: dmsText };
  }

  const violations = normalizeViolations(req.body.violations);

  const created = await svc.create({
    title: req.body.title,
    type,
    violations, // ✅ store array
    description: req.body.description || "",
    location,
    reported_by: req.body.reported_by || null,
    status: normalizeStatus(req.body.status),
    images: Array.isArray(req.body.images) ? req.body.images : [],
  });

  res.status(201).json(created);
});

export const remove = asyncHandler(async (req, res) => {
  await svc.remove(req.params.id);
  res.json({ ok: true });
});

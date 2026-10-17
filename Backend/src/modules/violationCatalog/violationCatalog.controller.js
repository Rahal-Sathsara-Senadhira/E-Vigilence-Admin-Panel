import ViolationCatalogEntry from "../../db/providers/mongo/models/ViolationCatalogEntry.js";
import Violation from "../../db/providers/mongo/models/Violation.js";
import { HttpError } from "../../utils/httpError.js";

const SEVERITIES = ["minor", "moderate", "severe"];

function toId(doc) {
  if (!doc) return null;
  const x = { ...doc };
  x.id = String(x._id);
  delete x._id;
  return x;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// null/"" clears the fine (HQ hasn't set one yet); anything else must be a
// finite, non-negative number — a citation copies it as money owed.
function parseFineAmount(value) {
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new HttpError(400, "fineAmount must be a non-negative number");
  }
  return n;
}

// Only these fields are writable — previously the whole request body was
// passed to findByIdAndUpdate.
function buildPatch(body) {
  const patch = {};

  if ("name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name) throw new HttpError(400, "name is required");
    patch.name = name;
  }
  if ("legalCode" in body) patch.legalCode = body.legalCode ? String(body.legalCode).trim() : null;
  if ("fineAmount" in body) patch.fineAmount = parseFineAmount(body.fineAmount);
  if ("severity" in body) {
    if (!SEVERITIES.includes(body.severity)) {
      throw new HttpError(400, `severity must be one of: ${SEVERITIES.join(", ")}`);
    }
    patch.severity = body.severity;
  }
  if ("isActive" in body) patch.isActive = Boolean(body.isActive);

  return patch;
}

export async function list(req, res) {
  const q = (req.query.q || "").trim();
  const filter = q ? { name: { $regex: escapeRegex(q), $options: "i" } } : {};

  const rows = await ViolationCatalogEntry.find(filter).sort({ name: 1 }).lean();
  res.json(rows.map(toId));
}

export async function getOne(req, res) {
  const row = await ViolationCatalogEntry.findById(req.params.id).lean();
  if (!row) return res.status(404).json({ message: "Catalog entry not found" });
  res.json(toId(row));
}

export async function create(req, res) {
  const patch = buildPatch({ isActive: true, ...(req.body || {}) });
  if (!patch.name) throw new HttpError(400, "name is required");

  const entry = await ViolationCatalogEntry.create(patch);
  res.status(201).json(toId(entry.toObject()));
}

export async function update(req, res) {
  const patch = buildPatch(req.body || {});

  const updated = await ViolationCatalogEntry.findByIdAndUpdate(req.params.id, patch, {
    new: true,
    runValidators: true,
  }).lean();
  if (!updated) return res.status(404).json({ message: "Catalog entry not found" });

  res.json(toId(updated));
}

// An entry that any violation uses can't be deleted — those violations would
// be left pointing at nothing and lose their offence. Retire it instead
// (isActive: false), which keeps history intact and stops new use.
export async function remove(req, res) {
  const inUse = await Violation.countDocuments({ violations: req.params.id });
  if (inUse > 0) {
    throw new HttpError(
      409,
      `This offence is used by ${inUse} violation(s) and can't be deleted — mark it inactive instead`
    );
  }

  const deleted = await ViolationCatalogEntry.findByIdAndDelete(req.params.id).lean();
  if (!deleted) return res.status(404).json({ message: "Catalog entry not found" });
  res.json({ ok: true });
}

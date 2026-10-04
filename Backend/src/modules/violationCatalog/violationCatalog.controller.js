import ViolationCatalogEntry from "../../db/providers/mongo/models/ViolationCatalogEntry.js";

function toId(doc) {
  if (!doc) return null;
  const x = { ...doc };
  x.id = String(x._id);
  delete x._id;
  return x;
}

export async function list(req, res) {
  const q = (req.query.q || "").trim();
  const filter = q ? { name: { $regex: q, $options: "i" } } : {};

  const rows = await ViolationCatalogEntry.find(filter).sort({ name: 1 }).lean();
  res.json(rows.map(toId));
}

export async function getOne(req, res) {
  const row = await ViolationCatalogEntry.findById(req.params.id).lean();
  if (!row) return res.status(404).json({ message: "Catalog entry not found" });
  res.json(toId(row));
}

export async function create(req, res) {
  const { name, legalCode = null, fineAmount = null, severity, isActive = true } = req.body || {};

  if (!name) return res.status(400).json({ message: "name is required" });

  const entry = await ViolationCatalogEntry.create({
    name,
    legalCode,
    fineAmount: fineAmount == null ? null : Number(fineAmount),
    severity,
    isActive: Boolean(isActive),
  });

  res.status(201).json(toId(entry.toObject()));
}

export async function update(req, res) {
  const patch = { ...req.body };
  if ("fineAmount" in patch) {
    patch.fineAmount = patch.fineAmount == null ? null : Number(patch.fineAmount);
  }

  const updated = await ViolationCatalogEntry.findByIdAndUpdate(req.params.id, patch, {
    new: true,
  }).lean();
  if (!updated) return res.status(404).json({ message: "Catalog entry not found" });

  res.json(toId(updated));
}

export async function remove(req, res) {
  const deleted = await ViolationCatalogEntry.findByIdAndDelete(req.params.id).lean();
  if (!deleted) return res.status(404).json({ message: "Catalog entry not found" });
  res.json({ ok: true });
}

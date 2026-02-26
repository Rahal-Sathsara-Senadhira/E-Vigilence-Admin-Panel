import PoliceStation from "../../db/providers/mongo/models/PoliceStation.js";

function toId(doc) {
  if (!doc) return null;
  const x = { ...doc };
  x.id = String(x._id);
  delete x._id;
  return x;
}

export async function list(req, res) {
  const q = (req.query.q || "").trim();
  const filter = q
    ? { name: { $regex: q, $options: "i" } }
    : {};

  const rows = await PoliceStation.find(filter).sort({ name: 1 }).lean();
  res.json(rows.map(toId));
}

export async function getOne(req, res) {
  const row = await PoliceStation.findById(req.params.id).lean();
  if (!row) return res.status(404).json({ message: "Station not found" });
  res.json(toId(row));
}

export async function create(req, res) {
  const {
    name,
    code = null,
    phone = null,
    address = null,
    district = null,
    province = null,
    lat,
    lng,
    dms = null,
    isActive = true,
  } = req.body || {};

  if (!name) return res.status(400).json({ message: "name is required" });

  const station = await PoliceStation.create({
    name,
    code,
    phone,
    address,
    district,
    province,
    dms,
    isActive: Boolean(isActive),
    location:
      typeof lat === "number" && typeof lng === "number"
        ? { type: "Point", coordinates: [lng, lat] }
        : undefined,
  });

  res.status(201).json({ id: String(station._id) });
}

export async function update(req, res) {
  const id = req.params.id;

  const patch = { ...req.body };

  // handle geo updates from lat/lng
  if (typeof patch.lat === "number" && typeof patch.lng === "number") {
    patch.location = { type: "Point", coordinates: [patch.lng, patch.lat] };
  }
  delete patch.lat;
  delete patch.lng;

  const updated = await PoliceStation.findByIdAndUpdate(id, patch, { new: true }).lean();
  if (!updated) return res.status(404).json({ message: "Station not found" });

  res.json(toId(updated));
}

export async function remove(req, res) {
  const deleted = await PoliceStation.findByIdAndDelete(req.params.id).lean();
  if (!deleted) return res.status(404).json({ message: "Station not found" });
  res.json({ ok: true });
}
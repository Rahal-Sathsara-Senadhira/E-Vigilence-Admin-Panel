import RegionalStation from "../../../db/providers/mongo/models/RegionalStation.js";
import { toId, toIds } from "../../../db/providers/mongo/models/_helpers.js";

export async function list() {
  const docs = await RegionalStation.find({}).sort({ createdAt: -1 }).lean();
  return toIds(docs);
}

export async function getById(id) {
  const doc = await RegionalStation.findById(id).lean();
  return toId(doc);
}

export async function create(payload) {
  const doc = await RegionalStation.create(payload);
  return toId(doc);
}

export async function update(id, payload) {
  const doc = await RegionalStation.findByIdAndUpdate(id, payload, { new: true }).lean();
  return toId(doc);
}

export async function remove(id) {
  const r = await RegionalStation.deleteOne({ _id: id });
  return r.deletedCount > 0;
}

// ✅ BULK UPSERT (seed)
export async function bulkUpsert(stations) {
  const ops = stations.map((s) => {
    const name = String(s.name || "").trim();
    const code = s.code ? String(s.code).trim() : null;

    // "identity" rule:
    // - if code exists => use code
    // - else fallback to name + region
    const filter = code
      ? { code }
      : { name, region: String(s.region || "").trim() };

    return {
      updateOne: {
        filter,
        update: {
          $set: {
            name,
            code,
            region: String(s.region || "").trim(),
            address: String(s.address || "").trim(),
            phone: String(s.phone || "").trim(),
            email: String(s.email || "").trim(),
            location: {
              lat: s.location?.lat ?? s.latitude ?? null,
              lng: s.location?.lng ?? s.longitude ?? null,
              dms: String(s.location?.dms || s.dms || "").trim(),
            },
          },
        },
        upsert: true,
      },
    };
  });

  const r = await RegionalStation.bulkWrite(ops, { ordered: false });

  return {
    ok: true,
    inserted: r.upsertedCount || 0,
    modified: r.modifiedCount || 0,
    matched: r.matchedCount || 0,
  };
}

export default { list, getById, create, update, remove, bulkUpsert };
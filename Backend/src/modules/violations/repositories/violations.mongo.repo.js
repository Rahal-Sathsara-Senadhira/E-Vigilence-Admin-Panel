import Violation from "../../../db/providers/mongo/models/Violation.js";
import { toId } from "../../../db/providers/mongo/models/_helpers.js";

function toFrontend(doc) {
  const v = toId(doc);

  return {
    id: v.id,
    title: v.title,
    status: v.status,

    category: v.type,

    // ✅ include stored violations array
    violations: Array.isArray(v.violations) ? v.violations : [],

    latitude: v.location?.lat ?? null,
    longitude: v.location?.lng ?? null,
    location_text: v.location?.dms ?? null,

    description: v.description ?? "",

    created_at: v.createdAt ?? null,
  };
}

export async function list({ type, status, q, limit = 50, offset = 0 }) {
  const filter = {};
  if (type) filter.type = type;
  if (status) filter.status = status;

  if (q) {
    filter.$or = [
      { title: { $regex: String(q), $options: "i" } },
      { description: { $regex: String(q), $options: "i" } },
      { violations: { $elemMatch: { $regex: String(q), $options: "i" } } }, // ✅ search inside array
    ];
  }

  const [total, docs] = await Promise.all([
    Violation.countDocuments(filter),
    Violation.find(filter)
      .sort({ createdAt: -1 })
      .skip(Number(offset) || 0)
      .limit(Number(limit) || 50)
      .lean(),
  ]);

  return {
    data: docs.map(toFrontend),
    meta: {
      total,
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    },
  };
}

export async function getById(id) {
  const doc = await Violation.findById(id).lean();
  return doc ? toFrontend(doc) : null;
}

export async function create(payload) {
  const doc = await Violation.create(payload);
  return toFrontend(doc.toObject());
}

export async function remove(id) {
  const r = await Violation.deleteOne({ _id: id });
  return r.deletedCount > 0;
}

export default { list, getById, create, remove };

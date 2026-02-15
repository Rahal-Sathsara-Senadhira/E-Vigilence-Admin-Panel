import Violation from "../../../db/providers/mongo/models/Violation.js";
import { toId, toIds } from "../../../db/providers/mongo/models/_helpers.js";

export async function list({ type, status, q }) {
  const filter = {};
  if (type) filter.type = type;
  if (status) filter.status = status;

  if (q) {
    filter.$or = [
      { title: { $regex: String(q), $options: "i" } },
      { description: { $regex: String(q), $options: "i" } },
    ];
  }

  const docs = await Violation.find(filter).sort({ createdAt: -1 }).lean();
  return toIds(docs);
}

export async function getById(id) {
  const doc = await Violation.findById(id).lean();
  return toId(doc);
}

export async function create(payload) {
  const doc = await Violation.create(payload);
  return toId(doc);
}

export async function remove(id) {
  const r = await Violation.deleteOne({ _id: id });
  return r.deletedCount > 0;
}

export default { list, getById, create, remove };

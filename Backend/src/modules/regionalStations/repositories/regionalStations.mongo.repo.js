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

export default { list, getById, create, update, remove };

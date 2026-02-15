import Setting from "../../../db/providers/mongo/models/Setting.js";
import { toId, toIds } from "../../../db/providers/mongo/models/_helpers.js";

export async function list() {
  const docs = await Setting.find({}).sort({ key: 1 }).lean();
  return toIds(docs);
}

export async function getByKey(key) {
  const doc = await Setting.findOne({ key }).lean();
  return toId(doc);
}

export async function upsert(key, value) {
  const doc = await Setting.findOneAndUpdate(
    { key },
    { key, value },
    { new: true, upsert: true }
  ).lean();

  return toId(doc);
}

export default { list, getByKey, upsert };

import Notification from "../../../db/providers/mongo/models/Notification.js";
import { toId, toIds } from "../../../db/providers/mongo/models/_helpers.js";

export async function list({ user_id }) {
  const filter = {};
  if (user_id) filter.user_id = user_id;

  const docs = await Notification.find(filter).sort({ createdAt: -1 }).lean();
  return toIds(docs);
}

export async function create(payload) {
  const doc = await Notification.create(payload);
  return toId(doc);
}

export async function markRead(id) {
  const doc = await Notification.findByIdAndUpdate(id, { is_read: true }, { new: true }).lean();
  return toId(doc);
}

export async function remove(id) {
  const r = await Notification.deleteOne({ _id: id });
  return r.deletedCount > 0;
}

export default { list, create, markRead, remove };

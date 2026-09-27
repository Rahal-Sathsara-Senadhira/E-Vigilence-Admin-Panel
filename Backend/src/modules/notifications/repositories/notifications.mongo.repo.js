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

// `ownerFilter` is {} for hq (unrestricted) or { user_id } for everyone else,
// so a non-owner's attempt matches no document and looks like a 404 rather
// than leaking whether the notification exists.
export async function markRead(id, ownerFilter = {}) {
  const doc = await Notification.findOneAndUpdate(
    { _id: id, ...ownerFilter },
    { is_read: true },
    { new: true }
  ).lean();
  return toId(doc);
}

export async function remove(id, ownerFilter = {}) {
  const r = await Notification.deleteOne({ _id: id, ...ownerFilter });
  return r.deletedCount > 0;
}

export async function unreadCount(user_id) {
  const filter = { is_read: false };
  if (user_id) filter.user_id = user_id;
  return Notification.countDocuments(filter);
}

export default { list, create, markRead, remove, unreadCount };

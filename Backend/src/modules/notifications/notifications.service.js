import repo from "./notifications.repository.js";
import { HttpError } from "../../utils/httpError.js";

export async function list(filters) {
  return repo.list(filters);
}

export async function create(payload) {
  return repo.create(payload);
}

export async function markRead(id, ownerFilter) {
  const item = await repo.markRead(id, ownerFilter);
  if (!item) throw new HttpError(404, "Notification not found");
  return item;
}

export async function remove(id, ownerFilter) {
  const ok = await repo.remove(id, ownerFilter);
  if (!ok) throw new HttpError(404, "Notification not found");
  return true;
}

export async function unreadCount(user_id) {
  return repo.unreadCount(user_id);
}

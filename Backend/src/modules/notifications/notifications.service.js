import repo from "./notifications.repository.js";
import { HttpError } from "../../utils/httpError.js";

export async function list(filters) {
  return repo.list(filters);
}

export async function create(payload) {
  return repo.create(payload);
}

export async function markRead(id) {
  const item = await repo.markRead(id);
  if (!item) throw new HttpError(404, "Notification not found");
  return item;
}

export async function remove(id) {
  const ok = await repo.remove(id);
  if (!ok) throw new HttpError(404, "Notification not found");
  return true;
}

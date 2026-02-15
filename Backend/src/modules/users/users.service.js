import repo from "./users.repository.js";
import { HttpError } from "../../utils/httpError.js";

export async function list() {
  return repo.list();
}

export async function getById(id) {
  const u = await repo.getById(id);
  if (!u) throw new HttpError(404, "User not found");
  return u;
}

export async function create(payload) {
  return repo.create(payload);
}

export async function update(id, payload) {
  const u = await repo.update(id, payload);
  if (!u) throw new HttpError(404, "User not found");
  return u;
}

export async function remove(id) {
  const ok = await repo.remove(id);
  if (!ok) throw new HttpError(404, "User not found");
  return true;
}

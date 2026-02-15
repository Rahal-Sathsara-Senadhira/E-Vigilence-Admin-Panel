import repo from "./regionalStations.repository.js";
import { HttpError } from "../../utils/httpError.js";

export async function list() {
  return repo.list();
}

export async function getById(id) {
  const item = await repo.getById(id);
  if (!item) throw new HttpError(404, "Station not found");
  return item;
}

export async function create(payload) {
  return repo.create(payload);
}

export async function update(id, payload) {
  const item = await repo.update(id, payload);
  if (!item) throw new HttpError(404, "Station not found");
  return item;
}

export async function remove(id) {
  const ok = await repo.remove(id);
  if (!ok) throw new HttpError(404, "Station not found");
  return true;
}

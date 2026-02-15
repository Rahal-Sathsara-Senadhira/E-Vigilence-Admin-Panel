import repo from "./violations.repository.js";
import { HttpError } from "../../utils/httpError.js";

export async function list(filters) {
  return repo.list(filters);
}

export async function getById(id) {
  const v = await repo.getById(id);
  if (!v) throw new HttpError(404, "Violation not found");
  return v;
}

export async function create(payload) {
  return repo.create(payload);
}

export async function remove(id) {
  const ok = await repo.remove(id);
  if (!ok) throw new HttpError(404, "Violation not found");
  return true;
}

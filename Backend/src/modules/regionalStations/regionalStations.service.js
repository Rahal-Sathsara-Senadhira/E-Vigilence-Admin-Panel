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

// ✅ BULK UPSERT
export async function bulkUpsert(payload) {
  if (!Array.isArray(payload)) {
    throw new HttpError(400, "Body must be an array of stations");
  }
  if (payload.length === 0) {
    throw new HttpError(400, "Station list is empty");
  }

  // minimal validation
  for (const s of payload) {
    if (!s?.name || String(s.name).trim().length < 2) {
      throw new HttpError(400, "Each station must have a valid name");
    }
  }

  return repo.bulkUpsert(payload);
}
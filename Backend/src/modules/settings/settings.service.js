import repo from "./settings.repository.js";

export async function list() {
  return repo.list();
}

export async function getByKey(key) {
  return repo.getByKey(key);
}

export async function upsert(key, value) {
  return repo.upsert(key, value);
}

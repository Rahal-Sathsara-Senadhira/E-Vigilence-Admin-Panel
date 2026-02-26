import repo from "./dashboard.repository.js";

export async function get({ days } = {}) {
  return repo.get({ days });
}
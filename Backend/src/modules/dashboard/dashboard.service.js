import repo from "./dashboard.repository.js";

export async function get() {
  return repo.get();
}

import repo from "./reports.repository.js";

export async function summary(filters) {
  return repo.summary(filters);
}

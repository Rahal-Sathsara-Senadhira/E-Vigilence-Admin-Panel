import { api } from "./api";

// Backend/src/modules/violationCatalog — the controlled violation-type
// vocabulary (VIOLATIONS_BUSINESS_LOGIC.md #1). Reads are open to any
// authenticated role (station officers pick from this list too); writes are
// HQ-only, enforced server-side.
const BASE = "/api/violation-catalog";

export function listViolationCatalog({ q = "" } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);

  const qs = params.toString() ? `?${params.toString()}` : "";
  return api.get(`${BASE}${qs}`);
}

export function createViolationCatalogEntry(payload) {
  return api.post(BASE, payload);
}

export function updateViolationCatalogEntry(id, payload) {
  return api.patch(`${BASE}/${id}`, payload);
}

export function deleteViolationCatalogEntry(id) {
  return api.del(`${BASE}/${id}`);
}

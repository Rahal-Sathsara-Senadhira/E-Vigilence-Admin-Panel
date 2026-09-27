import { api } from "./api";

// The actual RegionalStation backend module (Backend/src/modules/regionalStations).
// This used to point at /api/stations first — which is the *Police Stations*
// module (Backend/src/modules/stations), a different resource entirely — and
// only fell back to this correct path on a 404. Since /api/stations is a
// real, working endpoint, that fallback never triggered: this page was
// silently showing Police Stations data instead of Regional Stations.
const BASE = "/api/regional-stations";

// ✅ Supports search & filters through query params
export function listRegionalStations({ q = "", region = "" } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (region) params.set("region", region);

  const qs = params.toString() ? `?${params.toString()}` : "";
  return api.get(`${BASE}${qs}`);
}

export function createRegionalStation(payload) {
  return api.post(BASE, payload);
}

export function deleteRegionalStation(id) {
  return api.del(`${BASE}/${id}`);
}

export function updateRegionalStation(id, payload) {
  return api.patch(`${BASE}/${id}`, payload);
}

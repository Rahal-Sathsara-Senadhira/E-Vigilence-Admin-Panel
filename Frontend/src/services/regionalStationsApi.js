import { api } from "./api";

// ✅ Single source of truth
const PRIMARY = "/api/stations";

// ✅ Optional backward-compat (in case your backend still uses old path)
const FALLBACK = "/api/regional-stations";

async function tryGet(path) {
  try {
    return await api.get(path);
  } catch (e) {
    // only fallback on 404
    if (e?.status === 404) return await api.get(FALLBACK + path.replace(PRIMARY, ""));
    throw e;
  }
}

async function tryPost(path, payload) {
  try {
    return await api.post(path, payload);
  } catch (e) {
    if (e?.status === 404) return await api.post(FALLBACK + path.replace(PRIMARY, ""), payload);
    throw e;
  }
}

// ✅ Supports search & filters through query params
export function listRegionalStations({ q = "", region = "" } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (region) params.set("region", region);

  const qs = params.toString() ? `?${params.toString()}` : "";
  return tryGet(`${PRIMARY}${qs}`);
}

export function createRegionalStation(payload) {
  return tryPost(PRIMARY, payload);
}

// ✅ (Optional for later)
export function deleteRegionalStation(id) {
  return api.del(`${PRIMARY}/${id}`);
}

export function updateRegionalStation(id, payload) {
  return api.patch(`${PRIMARY}/${id}`, payload);
}

// ✅ Nearest station from DB
export function getNearestStation(lat, lng) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  return api.get(`${PRIMARY}/nearest?${params.toString()}`);
}

import { api } from "./api";

// Primary path
const PRIMARY = "/api/users";

// Optional fallback (if your backend uses another route)
const FALLBACK = "/api/admin/users";

async function tryGet(path) {
  try {
    return await api.get(path);
  } catch (e) {
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

async function tryPatch(path, payload) {
  try {
    return await api.patch(path, payload);
  } catch (e) {
    if (e?.status === 404) return await api.patch(FALLBACK + path.replace(PRIMARY, ""), payload);
    throw e;
  }
}

async function tryDel(path) {
  try {
    return await api.del(path);
  } catch (e) {
    if (e?.status === 404) return await api.del(FALLBACK + path.replace(PRIMARY, ""));
    throw e;
  }
}

// Param names here must match what Backend/src/modules/users/users.service.js
// actually reads off req.query: role, isActive, stationId, q (camelCase —
// this used to send status/station_id, which the backend silently ignored).
export function listUsers({ q = "", role = "", isActive = "", stationId = "", page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (role) params.set("role", role);
  if (isActive) params.set("isActive", isActive);
  if (stationId) params.set("stationId", stationId);
  params.set("page", String(page));
  params.set("limit", String(limit));

  return tryGet(`${PRIMARY}?${params.toString()}`);
}

export function createUser(payload) {
  return tryPost(PRIMARY, payload);
}

export function updateUser(id, payload) {
  return tryPatch(`${PRIMARY}/${id}`, payload);
}

export function deleteUser(id) {
  return tryDel(`${PRIMARY}/${id}`);
}
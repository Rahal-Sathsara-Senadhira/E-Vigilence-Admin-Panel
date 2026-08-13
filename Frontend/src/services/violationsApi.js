// src/services/violationsApi.js
import { api } from "./api";
import { getToken } from "../utils/auth";
import { showToast } from "../utils/toastBus";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8081";

export function createViolation(payload) {
  return api.post("/api/violations", payload);
}

export function listViolations(params = {}) {
  const qs = new URLSearchParams();

  if (params.status) qs.set("status", params.status);
  if (params.category) qs.set("category", params.category);
  if (params.q) qs.set("q", params.q);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));

  const query = qs.toString();
  return api.get(`/api/violations${query ? `?${query}` : ""}`);
}

// ✅ NEW: load single violation
export function getViolation(id) {
  return api.get(`/api/violations/${id}`);
}

// ✅ NEW: dispatch to nearest station (admin only)
export function dispatchNearest(id) {
  return api.post(`/api/violations/${id}/dispatch-nearest`, {});
}

export function updateViolation(id, payload) {
  return api.patch(`/api/violations/${id}`, payload);
}

export function deleteViolation(id) {
  return api.del(`/api/violations/${id}`);
}

// Uploads evidence files and returns { images: [urls], videos: [urls], audios: [urls] }.
// Uses fetch directly (not the shared JSON `api` client) since this is multipart/form-data.
export async function uploadEvidence(files) {
  const token = getToken();

  const form = new FormData();
  (files.images || []).forEach((f) => form.append("images", f));
  (files.videos || []).forEach((f) => form.append("videos", f));
  (files.audios || []).forEach((f) => form.append("audios", f));

  const res = await fetch(`${BASE_URL}/api/violations/upload-evidence`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = json?.message || `Upload failed (${res.status})`;
    showToast(msg, "error");
    throw new Error(msg);
  }

  return json?.data || { images: [], videos: [], audios: [] };
}
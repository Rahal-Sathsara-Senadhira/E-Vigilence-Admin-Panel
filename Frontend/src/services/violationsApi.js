// src/services/violationsApi.js
import { api } from "./api";

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
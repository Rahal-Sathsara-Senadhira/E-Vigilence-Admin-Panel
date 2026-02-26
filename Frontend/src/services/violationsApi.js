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

export function getViolation(id) {
  return api.get(`/api/violations/${id}`);
}

/**
 * Sends a violation "report" to the nearest police station based on violation lat/lng
 * Backend should implement:
 * POST /api/violations/:id/dispatch-nearest
 */
export function dispatchNearestStationForViolation(id) {
  return api.post(`/api/violations/${id}/dispatch-nearest`, {});
}
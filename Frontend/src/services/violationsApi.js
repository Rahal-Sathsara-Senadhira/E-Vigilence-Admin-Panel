// src/services/violationsApi.js
import { api } from "./api";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8081";

// Staff complaint (New Complaint page). `idempotencyKey` should stay the
// same for every retry of one submission, so a retried request returns the
// original complaint instead of creating a second one.
export function createComplaint(payload, idempotencyKey) {
  return api.post("/api/violations", payload, {
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
  });
}

// Recent complaints that look like the one being filled in.
export function checkDuplicates({ vehicleNumber, violations, location }) {
  return api.post(
    "/api/violations/check-duplicates",
    { vehicleNumber, violations, location },
    { silent: true }
  );
}

// Uploads one evidence file; resolves to { id, kind, url, sha256, size,
// mimeType, originalName }. XHR rather than fetch so upload progress can be
// shown (`onProgress` gets 0–1). Returns { promise, abort }.
export function uploadEvidenceFile(file, kind, onProgress) {
  const xhr = new XMLHttpRequest();
  const promise = new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("kind", kind);
    form.append("lastModified", String(file.lastModified || ""));
    form.append("file", file);

    xhr.open("POST", `${BASE_URL}/api/violations/evidence`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let json = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(json);
      else reject(new Error(json?.message || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}

// Drops an upload that was removed from the form before submitting.
export function discardEvidenceFile(uploadId) {
  return api.del(`/api/violations/evidence/${uploadId}`, { silent: true });
}

export function listViolations(params = {}) {
  const qs = new URLSearchParams();

  if (params.status) qs.set("status", params.status);
  if (params.category) qs.set("category", params.category);
  if (params.q) qs.set("q", params.q);
  if (params.unassigned) qs.set("unassigned", "true");
  if (params.duplicates) qs.set("duplicates", "true");
  if (params.sort) qs.set("sort", params.sort);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));

  const query = qs.toString();
  return api.get(`/api/violations${query ? `?${query}` : ""}`);
}

// { total, byStatus: { open: n, … }, unassigned, duplicates } — scoped to the
// caller's station server-side.
export function getViolationStats() {
  return api.get("/api/violations/stats");
}

// ✅ NEW: load single violation
export function getViolation(id) {
  return api.get(`/api/violations/${id}`);
}

// ✅ NEW: dispatch to nearest station (admin only)
export function dispatchNearest(id) {
  return api.post(`/api/violations/${id}/dispatch-nearest`, {});
}

// Manual override: HQ picks the station (e.g. when the violation has no map
// location, so "nearest" can't be computed).
export function dispatchToStation(id, stationId) {
  return api.post(`/api/violations/${id}/dispatch-to/${stationId}`, {});
}

export function updateViolation(id, payload) {
  return api.patch(`/api/violations/${id}`, payload);
}

export function deleteViolation(id) {
  return api.del(`/api/violations/${id}`);
}

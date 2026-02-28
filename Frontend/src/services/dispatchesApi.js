// src/services/dispatchesApi.js
import { api } from "./api";

// Tries the common endpoints.
// If your backend uses a different URL, change it ONLY HERE.
export async function getDispatchByViolation(violationId) {
  // 1) /api/dispatches/by-violation/:id
  try {
    const res = await api.get(`/api/dispatches/by-violation/${violationId}`);
    return res?.data ?? res;
  } catch (e1) {
    // 2) /api/dispatches?violationId=...
    try {
      const res = await api.get(`/api/dispatches?violationId=${encodeURIComponent(violationId)}`);
      return res?.data ?? res;
    } catch (e2) {
      // rethrow the original error (more useful usually)
      throw e1;
    }
  }
}
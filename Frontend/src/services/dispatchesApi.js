// src/services/dispatchesApi.js
import { api } from "./api";

// Backend/src/modules/dispatch/dispatch.routes.js's only "by violation"
// route is GET /api/dispatches/by-violation/:id — this used to fall back to
// GET /api/dispatches?violationId=... on any failure, but that route never
// existed, so every violation that simply hadn't been dispatched yet (a
// completely normal state, a plain 404 from the real endpoint) triggered a
// second, guaranteed-failing request and two visible error toasts on page
// load. `silent: true` also stops the expected "no dispatch yet" 404 itself
// from surfacing as an error toast — the caller (ViolationDetails.jsx)
// already handles it by showing "Not assigned yet."
export async function getDispatchByViolation(violationId) {
  const res = await api.get(`/api/dispatches/by-violation/${violationId}`, { silent: true });
  return res?.data ?? res;
}
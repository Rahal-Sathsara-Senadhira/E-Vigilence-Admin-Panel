// The steps every case goes through, applied to a case document in the
// caller's transaction. The time limits in force at each step are fixed on
// the case then (docs/09 T2).

import { limitAt } from "../settings/settings.service.js";

/** @typedef {import("./case.model.js").CaseDocument} CaseDocument */
/** @typedef {import("./dispatch.js").DispatchPlan} DispatchPlan */
/** @typedef {{ id: any, name: string }} Person */

/** @param {CaseDocument} c @param {string} event @param {string} by @param {string | null} [note] */
export function addEvent(c, event, by, note = null) {
  c.timeline.push({ at: new Date(), event, by, note });
}

/** The station's current dispatch, if the case is at a station. @param {CaseDocument} c */
export const currentDispatch = (c) => {
  const d = c.dispatches.at(-1);
  return d && !d.endedAt ? d : null;
};

/**
 * Ends the current dispatch (returned, re-dispatched, closed).
 * @param {CaseDocument} c @param {string} reason @param {string | null} note
 */
export function endDispatch(c, reason, note) {
  const d = currentDispatch(c);
  if (!d) return;
  d.endedAt = new Date();
  d.endReason = reason;
  d.endNote = note;
}

/**
 * Sends the case to a station (docs/03 §5): records the dispatch with its
 * deadlines. A station-recorded case is accepted at once, by its recorder.
 * @param {CaseDocument} c @param {DispatchPlan} plan @param {string} by
 * @param {{ reason?: string | null, acceptedBy?: Person | null, officer?: Person | null }} [extra]
 */
export async function dispatchTo(c, plan, by, extra = {}) {
  const now = new Date();
  const p1 = c.priority === "P1";
  const [acceptBy, workBy] = await Promise.all([
    limitAt(p1 ? "cases.accept_p1" : "cases.accept", now),
    limitAt(p1 ? "cases.work_start_p1" : "cases.work_start", now),
  ]);
  const warnings = [...plan.warnings, ...(c.disputed ? ["disputed_jurisdiction"] : [])];
  c.dispatches.push({
    stationId: plan.stationId,
    stationName: plan.stationName,
    method: plan.method,
    at: now,
    by,
    distanceKm: plan.distanceKm,
    warnings,
    reason: extra.reason ?? null,
    acceptBy,
    workBy,
  });
  c.stationId = plan.stationId;
  c.investigatingOfficer = null;
  c.assignOfficerBy = null;
  c.recommendBy = null;
  c.status = "dispatched";
  const how = {
    jurisdiction: "its area",
    nearest: `nearest station${plan.distanceKm !== null ? `, ${plan.distanceKm} km` : ""}`,
    manual: "chosen by HQ",
    station_recorded: "recorded there",
  }[plan.method];
  addEvent(
    c,
    "dispatched",
    by,
    `To ${plan.stationName} (${how})${extra.reason ? `: ${extra.reason}` : ""}${warnings.length ? ` · ${warnings.map((w) => w.replaceAll("_", " ")).join(", ")}` : ""}`,
  );
  if (extra.acceptedBy) await acceptAtStation(c, extra.acceptedBy, extra.officer ?? null);
}

/**
 * The station takes the case. The person accepting becomes the
 * investigating officer when they can investigate (docs/03 §6); otherwise
 * the OIC must assign one.
 * @param {CaseDocument} c @param {Person} by @param {Person | null} officer
 */
export async function acceptAtStation(c, by, officer) {
  const now = new Date();
  const d = currentDispatch(c);
  if (d) {
    d.acceptedAt = now;
    d.acceptedBy = by.name;
  }
  c.status = "accepted";
  c.investigatingOfficer = officer;
  const [assignBy, recommendBy] = await Promise.all([
    officer ? Promise.resolve(null) : limitAt("cases.assign_officer", now),
    limitAt("cases.recommend", now),
  ]);
  c.assignOfficerBy = assignBy;
  c.recommendBy = recommendBy;
  addEvent(
    c,
    "accepted",
    by.name,
    officer ? `Investigating officer: ${officer.name}` : "Needs an investigating officer",
  );
}

/**
 * Work was recorded: an accepted case becomes "investigating" by itself
 * (docs/03 C2).
 * @param {CaseDocument} c @param {string} by
 */
export function workRecorded(c, by) {
  if (!c.workStartedAt) c.workStartedAt = new Date();
  if (c.status === "accepted") {
    c.status = "investigating";
    addEvent(c, "investigating", by, "Work started");
  }
}

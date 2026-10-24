// What other modules may use from cases (docs/19 §4.2 rule 2).

import { nextNumber } from "#src/core/db/counters.js";
import { recordNumber } from "#src/core/srilanka.js";
import { ACTIVE_STATUSES, Case } from "./case.model.js";
import { addEvent, dispatchTo } from "./lifecycle.js";

export { Case };
export { autoPlan } from "./dispatch.js";
export { onCaseMoved, provideReportLookup } from "./cases.service.js";
export {
  closeAfterOutcome,
  onCaseDecided,
  onCasesMerged,
  onDecisionOverridden,
  reconsiderAfterDispute,
  recordNamedDriver,
} from "./outcomes.js";

/**
 * Opens a case from an accepted report — docs/02 §6.1, §7.
 *  - HQ triage: dispatched by the automatic choice (`plan`), or left open
 *    for HQ to choose when there is none (docs/03 C8).
 *  - Recorded at a station: dispatched there and accepted at once
 *    (`atStation`), by the person who recorded or confirmed it.
 * @param {import("mongoose").ClientSession} session
 * @param {{
 *   priority: "P1" | "P2" | "P3",
 *   facts: { offenceCodes: string[], vehicleNumber: string | null, plateUnknown: boolean, vehicleType: string | null, location: any, address: string | null, occurredAt: Date },
 *   reportId: any,
 *   noEvidenceReason?: string | null,
 *   by: { id: any, name: string },
 *   note: string,
 *   plan?: import("./dispatch.js").DispatchPlan | null,
 *   atStation?: { stationId: any, stationName: string, officer: { id: any, name: string } | null },
 * }} input
 */
export async function openCase(session, input) {
  const caseNumber = recordNumber("TC", await nextNumber("cases", session));
  const c = new Case();
  c.set({
    caseNumber,
    status: "open",
    priority: input.priority,
    facts: input.facts,
    reportIds: [input.reportId],
    noEvidenceReason: input.noEvidenceReason ?? null,
    openedBy: input.by,
  });
  addEvent(c, "opened", input.by.name, input.note);
  if (input.atStation) {
    await dispatchTo(
      c,
      {
        stationId: input.atStation.stationId,
        stationName: input.atStation.stationName,
        method: "station_recorded",
        distanceKm: null,
        warnings: [],
      },
      input.by.name,
      { acceptedBy: input.by, officer: input.atStation.officer },
    );
  } else if (input.plan) {
    await dispatchTo(c, input.plan, "Automatic dispatch");
  }
  await c.save({ session });
  return c;
}

/**
 * Attaches a report to an existing case (merge). A closed case is not
 * reopened — the report is added as information (docs/02 §6.2).
 * @param {import("mongoose").ClientSession} session @param {any} caseId @param {any} reportId @param {string} by
 */
export async function attachReport(session, caseId, reportId, by) {
  const c = await Case.findById(caseId, null, { session });
  if (!c) return null;
  if (!c.reportIds.some((id) => String(id) === String(reportId))) c.reportIds.push(reportId);
  addEvent(c, c.status === "closed" ? "report_added_closed" : "report_merged", by);
  await c.save({ session });
  return c;
}

/**
 * Removes a report from a case (merge undone, or HQ rejects a station
 * report). A case left with no report is closed (docs/02 §7, docs/03 C6).
 * @param {import("mongoose").ClientSession} session @param {any} caseId @param {any} reportId @param {string} by @param {string} reason
 */
export async function detachReport(session, caseId, reportId, by, reason) {
  const c = await Case.findById(caseId, null, { session });
  if (!c) return null;
  c.reportIds = c.reportIds.filter((id) => String(id) !== String(reportId));
  addEvent(c, "report_removed", by, reason);
  if (c.reportIds.length === 0 && c.status !== "closed") {
    const last = c.dispatches.at(-1);
    if (last && !last.endedAt) {
      last.endedAt = new Date();
      last.endReason = "closed";
    }
    c.status = "closed";
    c.closedReason = `No report left: ${reason}`;
    addEvent(c, "closed", by, c.closedReason);
  }
  await c.save({ session });
  return c;
}

/** Cases being worked at a station — it can't be closed while it holds any. @param {any} stationId */
export const activeCaseCount = (stationId) =>
  Case.countDocuments({ stationId, status: { $in: ACTIVE_STATUSES } });

/** For other modules (evidence): a case the user may see, or 404. */
export { loadVisible as visibleCase } from "./cases.service.js";

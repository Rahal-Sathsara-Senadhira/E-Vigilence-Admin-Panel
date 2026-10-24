// What HQ sees of a reward entry (docs/16 §9). Staff see why something was
// held or not eligible; the citizen sees only `citizenMessage`.

import { lineFor } from "./ledger.js";

const iso = (/** @type {Date | null | undefined} */ d) => (d ? new Date(d).toISOString() : null);

/**
 * @param {any} e @param {string | null} reporterName
 * @param {{ history?: boolean }} [options]
 */
export function entryView(e, reporterName, { history = false } = {}) {
  return {
    id: String(e._id),
    userId: e.userId,
    reporterName,
    kind: e.kind,
    reportId: String(e.reportId),
    reportNumber: e.reportNumber,
    caseId: String(e.caseId),
    caseNumber: e.caseNumber,
    plate: e.plate ?? null,
    basePoints: e.basePoints,
    share: e.share,
    points: e.points,
    status: e.status,
    citizenMessage: lineFor(e),
    hold: e.hold ? { reason: e.hold.reason, by: e.hold.by, at: iso(e.hold.at) } : null,
    /** Why it can't earn, for staff (the latest note of that event). */
    staffNote:
      e.status === "not_eligible"
        ? (e.history.findLast((/** @type {any} */ h) => h.event === "not_eligible")?.note ?? null)
        : null,
    confirmedAt: iso(e.confirmedAt),
    expiresAt: iso(e.expiresAt),
    recovered: Boolean(e.recoveredBy),
    createdAt: iso(e.createdAt),
    updatedAt: iso(e.updatedAt),
    ...(history
      ? {
          history: e.history.map((/** @type {any} */ h) => ({
            at: iso(h.at),
            event: h.event,
            by: h.by,
            note: h.note ?? null,
          })),
        }
      : {}),
  };
}

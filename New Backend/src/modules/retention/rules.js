// The retention schedule — docs/10 §6 (to be confirmed by legal review,
// D10-2). Each rule finds the records whose time is up, and those held back:
// nothing linked to an open dispute, court case or appeal is touched,
// whatever its age (legal hold).

import { Case } from "../cases/index.js";
import { CourtCase } from "../court/court.model.js";
import { Notice } from "../notices/index.js";
import { Report } from "../reports/report.model.js";

/** @typedef {{ id: any, number: string, since: Date, reason?: string }} Item */
/**
 * @typedef {object} Rule
 * @property {string} key
 * @property {string} label
 * @property {string} keptFor   as the schedule says it
 * @property {(now: Date) => Promise<{ due: Item[], held: Item[] }>} find
 */

/** `now` moved back by whole years. @param {Date} now @param {number} years */
export function yearsBefore(now, years) {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - years);
  return d;
}

/** When a case closed: its last "closed" event. @param {any} c */
const closedAt = (c) =>
  /** @type {Date | undefined} */ (c.timeline.findLast((t) => t.event === "closed")?.at);

/** Notices still running or disputed hold their case (legal hold). */
const NOTICE_DONE = /** @type {any[]} */ (["paid", "closed", "withdrawn", "transferred"]);
const COURT_DONE = /** @type {any[]} */ (["closed", "withdrawn"]);

/**
 * Why a case can't be touched yet, or null.
 * @param {any} caseId
 */
async function holdOnCase(caseId) {
  const open = await Notice.findOne(
    { caseId, status: { $nin: NOTICE_DONE } },
    { status: 1, noticeNumber: 1 },
  ).lean();
  if (open)
    return `${open.noticeNumber} is ${open.status === "disputed" ? "disputed" : "still running"}`;
  const court = await CourtCase.findOne(
    {
      caseId,
      $or: [{ status: { $nin: COURT_DONE } }, { "appeal.result": "pending" }],
    },
    { courtRef: 1 },
  ).lean();
  return court ? `${court.courtRef} is open or under appeal` : null;
}

/** @param {any[]} cases @param {Date} cutoff */
async function splitCases(cases, cutoff) {
  /** @type {Item[]} */ const due = [];
  /** @type {Item[]} */ const held = [];
  for (const c of cases) {
    const at = closedAt(c);
    if (!at || at > cutoff) continue;
    const reason = await holdOnCase(c._id);
    (reason ? held : due).push({
      id: c._id,
      number: c.caseNumber,
      since: at,
      ...(reason ? { reason } : {}),
    });
  }
  return { due, held };
}

const CASE_FIELDS = { caseNumber: 1, timeline: 1, decision: 1 };

/** @type {Rule[]} */
export const RULES = [
  {
    key: "rejected_reports",
    label: "Rejected reports",
    keptFor: "1 year after rejection: evidence deleted, report kept anonymised for statistics",
    async find(now) {
      const rows = await Report.find(
        { status: "rejected", retention: null, "triage.decidedAt": { $lte: yearsBefore(now, 1) } },
        { reportNumber: 1, triage: 1 },
      )
        .limit(2000)
        .lean();
      return {
        due: rows.map((r) => ({
          id: r._id,
          number: r.reportNumber,
          since: /** @type {Date} */ (r.triage.decidedAt),
        })),
        held: [],
      };
    },
  },
  {
    key: "nfa_cases",
    label: "Closed cases with no enforcement",
    keptFor: "2 years after closing: evidence deleted, personal data anonymised",
    async find(now) {
      const cutoff = yearsBefore(now, 2);
      const rows = await Case.find(
        {
          status: "closed",
          retention: null,
          updatedAt: { $lte: cutoff },
          $or: [{ decision: null }, { "decision.outcome.outcome": "no_further_action" }],
        },
        CASE_FIELDS,
      )
        .limit(2000)
        .lean();
      return splitCases(rows, cutoff);
    },
  },
  {
    key: "enforced_cases",
    label: "Cases with a paid notice or a warning",
    keptFor: "7 years after closing: evidence and personal data deleted",
    async find(now) {
      const cutoff = yearsBefore(now, 7);
      const rows = await Case.find(
        {
          status: "closed",
          retention: null,
          updatedAt: { $lte: cutoff },
          "decision.outcome.outcome": { $in: ["penalty_notice", "warning"] },
        },
        CASE_FIELDS,
      )
        .limit(2000)
        .lean();
      return splitCases(rows, cutoff);
    },
  },
  {
    key: "court_cases",
    label: "Court cases",
    keptFor: "10 years after the final verdict: evidence and personal data deleted",
    async find(now) {
      const cutoff = yearsBefore(now, 10);
      const rows = await CourtCase.find(
        { status: { $in: COURT_DONE }, retention: null, updatedAt: { $lte: cutoff } },
        { courtRef: 1, verdict: 1, appeal: 1, withdrawal: 1 },
      )
        .limit(2000)
        .lean();
      /** @type {Item[]} */ const due = [];
      /** @type {Item[]} */ const held = [];
      for (const cc of rows) {
        const final = cc.appeal?.decidedAt ?? cc.verdict?.confirmedAt ?? cc.withdrawal?.at;
        if (!final || final > cutoff) continue;
        const item = { id: cc._id, number: cc.courtRef, since: final };
        if (cc.appeal?.result === "pending") held.push({ ...item, reason: "Under appeal" });
        else due.push(item);
      }
      return { due, held };
    },
  },
];

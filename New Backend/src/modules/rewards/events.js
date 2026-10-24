// What moves reward points — docs/16 §4. Each rule follows one audit action
// (like the staff notifications, docs/09), in the change's own transaction:
// points earned, confirmed and reversed exactly when the case's outcome
// does, and never otherwise.

import { onAuditRecorded } from "#src/core/audit/audit.js";
import { CourtCase } from "../court/court.model.js";
import { Notice } from "../notices/index.js";
import { Report } from "../reports/report.model.js";
import {
  awardForCase,
  confirmForCase,
  penaliseFabricated,
  reverseForCase,
  unconfirmForCase,
} from "./ledger.js";

/** @typedef {import("#src/core/audit/audit.js").RecordedEntry} Entry */
/** @typedef {import("mongoose").ClientSession} Session */

/** @param {string} id @param {Session} session */
const noticeCase = async (id, session) =>
  (await Notice.findById(id, { caseId: 1, status: 1 }, { session }).lean()) ?? null;

/** Whether any notice of the case is paid — the reward then stands (D16-2). @param {any} caseId @param {Session} session */
const paidOn = async (caseId, session) =>
  Boolean(await Notice.exists({ caseId, status: "paid" }).session(session));

/** @type {Record<string, (e: Entry, session: Session) => Promise<unknown>>} */
const RULES = {
  // Earned when the case is decided with enforcement.
  "cases.decided": (e, s) => awardForCase(s, e.target.id),

  // Confirmed: the notice is paid…
  "payments.received": async (e, s) => {
    const n = await noticeCase(/** @type {string} */ (e.target.id), s);
    if (n?.status === "paid") await confirmForCase(s, n.caseId, "Notice paid");
  },
  "payments.receipt_recorded": async (e, s) => {
    const n = await noticeCase(/** @type {string} */ (e.target.id), s);
    if (n?.status === "paid") await confirmForCase(s, n.caseId, "Notice paid (receipt)");
  },
  "payments.receipt_reversed": async (e, s) => {
    const n = await noticeCase(/** @type {string} */ (e.target.id), s);
    if (n && !(await paidOn(n.caseId, s)))
      await unconfirmForCase(s, n.caseId, "Receipt reversed: the notice is unpaid again");
  },

  // …or the court convicts; any other verdict reverses.
  "court.verdict_confirmed": async (e, s) => {
    const cc = await CourtCase.findById(
      e.target.id,
      { caseId: 1, verdict: 1 },
      { session: s },
    ).lean();
    if (!cc?.verdict) return;
    if (cc.verdict.result === "convicted") await confirmForCase(s, cc.caseId, "Convicted");
    else await reverseForCase(s, cc.caseId, `Verdict: ${cc.verdict.result}`);
  },
  "court.appeal_decided": async (e, s) => {
    const cc = await CourtCase.findById(
      e.target.id,
      { caseId: 1, appeal: 1 },
      { session: s },
    ).lean();
    if (cc?.appeal?.result !== "changed" || !cc.appeal.newVerdict) return;
    if (cc.appeal.newVerdict === "convicted")
      await confirmForCase(s, cc.caseId, "Convicted on appeal");
    else await reverseForCase(s, cc.caseId, `Appeal: ${cc.appeal.newVerdict}`);
  },
  // Withdrawn because the notice was paid first: the payment confirms instead.
  "court.withdrawn": async (e, s) => {
    const cc = await CourtCase.findById(e.target.id, { caseId: 1 }, { session: s }).lean();
    if (cc && !(await paidOn(cc.caseId, s)))
      await reverseForCase(s, cc.caseId, "Court case withdrawn");
  },

  // Reversed: the outcome changed.
  "notices.withdrawn": async (e, s) => {
    const n = await noticeCase(/** @type {string} */ (e.target.id), s);
    if (n) await reverseForCase(s, n.caseId, "Notice withdrawn");
  },
  "notices.dispute_upheld": async (e, s) => {
    const n = await noticeCase(/** @type {string} */ (e.target.id), s);
    if (n) await reverseForCase(s, n.caseId, "Dispute upheld");
  },
  "cases.decision_overridden": (e, s) => reverseForCase(s, e.target.id, "Decision overridden"),
  "cases.reopened": (e, s) => reverseForCase(s, e.target.id, "Case reopened"),

  // Fabricated evidence (§7).
  "reports.rejected": async (e, s) => {
    const r = await Report.findById(
      e.target.id,
      { channel: 1, reportNumber: 1, source: 1, triage: 1 },
      { session: s },
    ).lean();
    if (r?.channel === "citizen_app" && r.source?.userId && r.triage.reasonCode === "fabricated")
      await penaliseFabricated(s, r.source.userId, r.reportNumber, e.actor.name);
  },
};

onAuditRecorded(async (entry, session) => {
  const rule = RULES[entry.action];
  if (rule && entry.target.id) await rule(entry, session);
});

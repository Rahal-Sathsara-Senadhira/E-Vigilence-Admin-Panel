// Staff notifications for events — docs/09 §5.2. Each rule follows one audit
// action: the log already records every change, in the change's own
// transaction, so nothing is told that didn't happen (and nothing that
// happened goes untold). The person who did it is never told.

import { onAuditRecorded } from "#src/core/audit/audit.js";
import { Case } from "../cases/index.js";
import { CourtCase } from "../court/court.model.js";
import { Notice } from "../notices/index.js";
import { Payment } from "../payments/payment.model.js";
import { Report } from "../reports/report.model.js";
import { notify } from "./notify.js";

/** @typedef {import("#src/core/audit/audit.js").RecordedEntry} Entry */
/** @typedef {import("mongoose").ClientSession} Session */
/** @typedef {import("./notify.js").Target} Target */

const HQ_DISPATCH = /** @type {Target} */ ({ national: ["hq_operator", "hq_supervisor"] });

/** Who decides a recommendation (docs/05 S2). @param {any} c @returns {Target[]} */
export function deciders(c) {
  if (c.decideLevel === "division") return [{ divisionOf: c.stationId }];
  if (c.decideLevel === "hq") return [{ national: ["hq_supervisor"] }];
  return [{ station: c.stationId, roles: ["station_oic"] }];
}

/** @param {string} id @param {Session} session */
const caseById = (id, session) => Case.findById(id, null, { session }).lean();
/** @param {string} id @param {Session} session */
const noticeById = (id, session) => Notice.findById(id, null, { session }).lean();
/** @param {string} id @param {Session} session */
const courtCaseById = (id, session) => CourtCase.findById(id, null, { session }).lean();

/** A case sent to a station, by HQ or by the automatic choice at triage. @param {any} id @param {Entry} e @param {Session} session */
async function dispatched(id, e, session) {
  const c = await caseById(id, session);
  const d = c?.dispatches.at(-1);
  if (!c || c.status !== "dispatched" || !d || d.endedAt) return;
  await notify(
    session,
    [{ station: c.stationId, roles: ["station_oic", "traffic_officer"] }],
    {
      kind: "case.dispatched",
      level: c.priority === "P1" ? "warning" : "info",
      title: `${c.caseNumber} sent to your station`,
      body: `Priority ${c.priority}. Accept it, or return it if it isn't your area.`,
      link: `/cases/${c._id}`,
      group: "Cases sent to your station",
    },
    { except: e.actor.id },
  );
}

/** @type {Record<string, (e: Entry, session: Session) => Promise<void>>} */
const RULES = {
  "cases.dispatched": (e, s) => dispatched(e.target.id, e, s),
  "reports.accepted": async (e, s) => {
    const r = await Report.findById(e.target.id, { caseId: 1 }, { session: s }).lean();
    if (r?.caseId) await dispatched(r.caseId, e, s);
  },

  "cases.officer_assigned": async (e, s) => {
    const c = await caseById(/** @type {string} */ (e.target.id), s);
    if (!c?.investigatingOfficer?.id) return;
    await notify(
      s,
      [{ user: c.investigatingOfficer.id }],
      {
        kind: "case.assigned",
        title: `${c.caseNumber} assigned to you`,
        body: "You are the investigating officer.",
        link: `/cases/${c._id}`,
      },
      { except: e.actor.id },
    );
  },

  "cases.recommended": async (e, s) => {
    const c = await caseById(/** @type {string} */ (e.target.id), s);
    if (!c || c.status !== "recommended") return;
    await notify(
      s,
      deciders(c),
      {
        kind: "case.recommended",
        title: `${c.caseNumber} waiting for your decision`,
        body: "A recommendation is ready to approve, change or send back.",
        link: `/cases/${c._id}`,
        group: "Recommendations waiting for your decision",
      },
      { except: e.actor.id },
    );
  },

  "cases.sent_back": async (e, s) => {
    const c = await caseById(/** @type {string} */ (e.target.id), s);
    if (!c?.investigatingOfficer?.id) return;
    await notify(
      s,
      [{ user: c.investigatingOfficer.id }],
      {
        kind: "case.sent_back",
        level: "warning",
        title: `Recommendation on ${c.caseNumber} sent back`,
        body: "Read the reason on the case and recommend again.",
        link: `/cases/${c._id}`,
      },
      { except: e.actor.id },
    );
  },

  "cases.returned": async (e, s) => {
    const c = await caseById(/** @type {string} */ (e.target.id), s);
    if (!c) return;
    const from = c.dispatches.at(-1)?.stationName ?? "A station";
    await notify(
      s,
      [HQ_DISPATCH],
      {
        kind: "case.returned",
        level: c.disputed ? "warning" : "info",
        title: `${from} returned ${c.caseNumber}`,
        body: c.disputed
          ? "Returned twice: the jurisdiction is disputed. Choose the station."
          : "Choose another station for it.",
        link: `/cases/${c._id}`,
        group: "Cases returned by stations",
      },
      { except: e.actor.id },
    );
  },

  "notices.disputed": async (e, s) => {
    const n = await noticeById(/** @type {string} */ (e.target.id), s);
    if (!n) return;
    await notify(
      s,
      [{ station: n.stationId, roles: ["station_oic"] }],
      {
        kind: "notice.disputed",
        title: `Dispute received on ${n.noticeNumber}`,
        body: "Review it before its time limit.",
        link: `/notices/${n._id}`,
        group: "Disputes received",
      },
      { except: e.actor.id },
    );
  },

  "notices.court_proposed": async (e, s) => {
    const n = await noticeById(/** @type {string} */ (e.target.id), s);
    if (!n) return;
    await notify(s, [{ station: n.stationId, roles: ["station_oic"] }], {
      kind: "notice.court_proposed",
      level: "warning",
      title: `Court referral proposed for ${n.noticeNumber}`,
      body: "Unpaid after the final date. Confirm the referral to court, or decide otherwise.",
      link: `/notices/${n._id}`,
      group: "Court referrals proposed",
    });
  },

  "court.referred": async (e, s) => {
    const cc = await courtCaseById(/** @type {string} */ (e.target.id), s);
    if (!cc) return;
    await notify(
      s,
      [{ user: cc.prosecutingOfficer?.id }, { station: cc.stationId, roles: ["station_clerk"] }],
      {
        kind: "court.referred",
        title: `${cc.courtRef} to prepare for court`,
        body: `Police case ${cc.caseNumber}.`,
        link: `/court/${cc._id}`,
        group: "Court cases to prepare",
      },
      { except: e.actor.id },
    );
  },

  "court.prepared": async (e, s) => {
    const cc = await courtCaseById(/** @type {string} */ (e.target.id), s);
    if (!cc) return;
    await notify(
      s,
      [{ station: cc.stationId, roles: ["station_oic"] }],
      {
        kind: "court.prepared",
        title: `${cc.courtRef} ready for your approval`,
        body: "Approve it for filing, or send it back.",
        link: `/court/${cc._id}`,
      },
      { except: e.actor.id },
    );
  },

  "court.verdict_recorded": async (e, s) => {
    const cc = await courtCaseById(/** @type {string} */ (e.target.id), s);
    if (!cc) return;
    await notify(
      s,
      [{ station: cc.stationId, roles: ["station_oic"] }],
      {
        kind: "court.verdict_recorded",
        title: `Verdict on ${cc.courtRef} to confirm`,
        link: `/court/${cc._id}`,
      },
      { except: e.actor.id },
    );
  },

  "payments.receipt_recorded": async (e, s) => {
    const p = await Payment.findOne({ noticeId: e.target.id, channel: "receipt" }, null, {
      session: s,
      sort: { createdAt: -1 },
    }).lean();
    if (!p) return;
    await notify(
      s,
      [{ national: ["finance_officer"] }],
      {
        kind: "payment.receipt_recorded",
        title: `Receipt for ${p.noticeNumber} to review`,
        body: "Check the scan against the amount and the notice.",
        link: `/payments/${p._id}`,
        group: "Receipts waiting for review",
      },
      { except: e.actor.id },
    );
  },
};

onAuditRecorded(async (entry, session) => {
  const rule = RULES[entry.action];
  if (rule && entry.target.id) await rule(entry, session);
});

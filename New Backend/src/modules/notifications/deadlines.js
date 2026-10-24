// Missed time limits — docs/09 §3, §4. Each clock finds the items past one
// deadline. A breach is recorded once per item and deadline (T3): at the
// limit the responsible person and their supervisor are told, at twice the
// limit HQ and the division supervisor (T4). It closes by itself when the
// item moves on. Deadlines were fixed when each step started (T2); the
// sweep only reads them.
//
// Also here: hearing reminders and stations left without an OIC (§4).

import { createHash } from "node:crypto";
import { inTransaction } from "#src/core/db/connection.js";
import { Case } from "../cases/index.js";
import { CourtCase } from "../court/court.model.js";
import { Notice } from "../notices/index.js";
import { Station } from "../organisation/organisation.model.js";
import { Payment } from "../payments/payment.model.js";
import { Report } from "../reports/report.model.js";
import { Payout } from "../rewards/payout.model.js";
import { limitRule, limitValue } from "../settings/settings.service.js";
import { User } from "../users/user.model.js";
import { deciders } from "./events.js";
import { Breach } from "./notification.model.js";
import { notify } from "./notify.js";

/** @typedef {import("./notify.js").Target} Target */

/**
 * One item past a deadline.
 * @typedef {object} Overdue
 * @property {"report" | "case" | "notice" | "court_case" | "payment" | "payout"} type
 * @property {any} id
 * @property {string} number
 * @property {any} stationId
 * @property {string} link
 * @property {Date} startedAt
 * @property {Date} dueAt
 * @property {Target[]} tell            at the limit
 * @property {Target[] | null} escalate at twice the limit; null where the table names none
 */
/** @typedef {{ key: string, label: string, find: (now: Date) => Promise<Overdue[]> }} Clock */

const DAY = 86_400_000;
const HQ = /** @type {Target} */ ({ national: ["hq_supervisor"] });
const FINANCE = /** @type {Target} */ ({ national: ["finance_officer"] });
/** @param {any} stationId @returns {Target[]} */
const hqOver = (stationId) => [HQ, { divisionOf: stationId }];
/** @param {any} stationId @returns {Target} */
const oic = (stationId) => ({ station: stationId, roles: ["station_oic"] });

const time = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Colombo",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
/** The day in Sri Lanka, for once-a-day alerts. */
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" });

// ── Clocks ──────────────────────────────────────────────────────────────

/** @param {any} c */
const caseItem = (c) => ({
  type: /** @type {const} */ ("case"),
  id: c._id,
  number: c.caseNumber,
  stationId: c.stationId,
  link: `/cases/${c._id}`,
});
/** @param {any} c @returns {Target[]} */
const officerAndOic = (c) => [{ user: c.investigatingOfficer?.id }, oic(c.stationId)];
const CASE_FIELDS = {
  caseNumber: 1,
  stationId: 1,
  status: 1,
  dispatches: 1,
  investigatingOfficer: 1,
  assignOfficerBy: 1,
  recommendBy: 1,
  decideBy: 1,
  decideLevel: 1,
  recommendations: 1,
};

/** @param {string} key @param {("P1" | "P2" | "P3")[]} priorities @param {string} label @returns {Clock} */
const triage = (key, priorities, label) => ({
  key,
  label,
  async find(now) {
    const rule = await limitRule(key);
    const rows = await Report.find(
      {
        status: "pending",
        priority: { $in: priorities },
        receivedAt: { $lte: rule.startedBy(now) },
      },
      { reportNumber: 1, receivedAt: 1 },
    ).lean();
    return rows.map((r) => ({
      type: /** @type {const} */ ("report"),
      id: r._id,
      number: r.reportNumber,
      stationId: null,
      link: `/reports/${r._id}`,
      startedAt: r.receivedAt,
      dueAt: rule.at(r.receivedAt),
      tell: [HQ],
      escalate: null,
    }));
  },
});

/** @type {Clock[]} */
export const CLOCKS = [
  triage("reports.triage_p1", ["P1"], "P1 report not triaged"),
  triage("reports.triage_p2p3", ["P2", "P3"], "report not triaged"),
  {
    key: "cases.accept",
    label: "not accepted by the station",
    async find(now) {
      const rows = await Case.find(
        { status: "dispatched", "dispatches.acceptBy": { $lte: now } },
        CASE_FIELDS,
      ).lean();
      return rows.flatMap((c) => {
        const d = c.dispatches.at(-1);
        if (!d?.acceptBy || d.endedAt) return [];
        return [
          {
            ...caseItem(c),
            startedAt: d.at,
            dueAt: d.acceptBy,
            tell: [
              { station: c.stationId, roles: ["station_oic", "traffic_officer"] },
              { national: ["hq_operator"] },
            ],
            escalate: hqOver(c.stationId),
          },
        ];
      });
    },
  },
  {
    key: "cases.work_start",
    label: "no work recorded",
    async find(now) {
      const rows = await Case.find(
        { status: { $in: ["dispatched", "accepted"] }, "dispatches.workBy": { $lte: now } },
        CASE_FIELDS,
      ).lean();
      return rows.flatMap((c) => {
        const d = c.dispatches.at(-1);
        if (!d?.workBy || d.endedAt) return [];
        return [
          {
            ...caseItem(c),
            startedAt: d.at,
            dueAt: d.workBy,
            tell: officerAndOic(c),
            escalate: hqOver(c.stationId),
          },
        ];
      });
    },
  },
  {
    key: "cases.assign_officer",
    label: "no investigating officer",
    async find(now) {
      const rows = await Case.find(
        {
          status: { $in: ["accepted", "investigating"] },
          investigatingOfficer: null,
          assignOfficerBy: { $lte: now },
        },
        CASE_FIELDS,
      ).lean();
      return rows.map((c) => ({
        ...caseItem(c),
        startedAt: c.dispatches.at(-1)?.acceptedAt ?? c.dispatches.at(-1)?.at ?? now,
        dueAt: /** @type {Date} */ (c.assignOfficerBy),
        tell: [oic(c.stationId)],
        escalate: hqOver(c.stationId),
      }));
    },
  },
  {
    key: "cases.recommend",
    label: "recommendation overdue",
    async find(now) {
      const rows = await Case.find(
        { status: { $in: ["accepted", "investigating"] }, recommendBy: { $lte: now } },
        CASE_FIELDS,
      ).lean();
      return rows.map((c) => ({
        ...caseItem(c),
        startedAt: c.dispatches.at(-1)?.acceptedAt ?? c.dispatches.at(-1)?.at ?? now,
        dueAt: /** @type {Date} */ (c.recommendBy),
        tell: officerAndOic(c),
        escalate: hqOver(c.stationId),
      }));
    },
  },
  {
    key: "cases.decide",
    label: "decision overdue",
    async find(now) {
      const rows = await Case.find(
        { status: "recommended", decideBy: { $lte: now } },
        CASE_FIELDS,
      ).lean();
      return rows.map((c) => ({
        ...caseItem(c),
        startedAt: c.recommendations.at(-1)?.at ?? now,
        dueAt: /** @type {Date} */ (c.decideBy),
        tell: deciders(c),
        escalate: hqOver(c.stationId),
      }));
    },
  },
  {
    key: "notices.post",
    label: "notice not posted",
    async find(now) {
      const rows = await Notice.find(
        { status: "issued", postBy: { $lte: now } },
        { noticeNumber: 1, stationId: 1, postBy: 1, issuedAt: 1, history: 1 },
      ).lean();
      return rows.map((n) => ({
        ...noticeItem(n),
        startedAt: n.history.findLast((h) => h.event === "readdressed")?.at ?? n.issuedAt,
        dueAt: /** @type {Date} */ (n.postBy),
        tell: [{ station: n.stationId, roles: ["station_oic", "station_clerk"] }],
        escalate: hqOver(n.stationId),
      }));
    },
  },
  {
    key: "notices.dispute_review",
    label: "dispute not reviewed",
    async find(now) {
      const rows = await Notice.find(
        { status: "disputed", "dispute.review": null, "dispute.reviewBy": { $lte: now } },
        { noticeNumber: 1, stationId: 1, dispute: 1 },
      ).lean();
      return rows.flatMap((n) =>
        n.dispute
          ? [
              {
                ...noticeItem(n),
                startedAt: n.dispute.at,
                dueAt: n.dispute.reviewBy,
                tell: [oic(n.stationId)],
                escalate: hqOver(n.stationId),
              },
            ]
          : [],
      );
    },
  },
  {
    key: "notices.reserve",
    label: "not re-served",
    async find(now) {
      const rows = await Notice.find(
        { status: "service_failed", "service.reserveBy": { $lte: now } },
        { noticeNumber: 1, stationId: 1, caseId: 1, service: 1, history: 1 },
      ).lean();
      const officers = new Map(
        (
          await Case.find(
            { _id: { $in: rows.map((n) => n.caseId) } },
            { investigatingOfficer: 1 },
          ).lean()
        ).map((c) => [String(c._id), c.investigatingOfficer?.id]),
      );
      return rows.map((n) => ({
        ...noticeItem(n),
        startedAt: n.history.findLast((h) => h.event === "service_failed")?.at ?? now,
        dueAt: /** @type {Date} */ (n.service?.reserveBy),
        tell: [{ user: officers.get(String(n.caseId)) }, oic(n.stationId)],
        escalate: hqOver(n.stationId),
      }));
    },
  },
  {
    key: "court.prepare",
    label: "not prepared for court",
    async find(now) {
      const rows = await CourtCase.find(
        { status: "referred", prepareBy: { $lte: now } },
        COURT_FIELDS,
      ).lean();
      return rows.map((cc) => ({
        ...courtItem(cc),
        startedAt: cc.createdAt,
        dueAt: /** @type {Date} */ (cc.prepareBy),
        tell: prosecutorAndOic(cc),
        escalate: null,
      }));
    },
  },
  {
    key: "court.file",
    label: "not filed in court",
    async find(now) {
      const rows = await CourtCase.find(
        { status: "approved", fileBy: { $lte: now } },
        COURT_FIELDS,
      ).lean();
      return rows.map((cc) => ({
        ...courtItem(cc),
        startedAt: cc.approvedAt ?? cc.createdAt,
        dueAt: /** @type {Date} */ (cc.fileBy),
        tell: prosecutorAndOic(cc),
        escalate: hqOver(cc.stationId),
      }));
    },
  },
  {
    key: "court.outcome_recorded",
    label: "hearing outcome not recorded",
    async find(now) {
      const rule = await limitRule("court.outcome_recorded");
      const rows = await CourtCase.find(
        {
          status: { $in: ["filed", "hearing"] },
          hearings: { $elemMatch: { outcome: null, date: { $lte: rule.startedBy(now) } } },
        },
        COURT_FIELDS,
      ).lean();
      return rows.flatMap((cc) => {
        const h = cc.hearings.find((x) => !x.outcome);
        if (!h) return [];
        return [
          {
            ...courtItem(cc),
            startedAt: h.date,
            dueAt: rule.at(h.date),
            tell: prosecutorAndOic(cc),
            escalate: null,
          },
        ];
      });
    },
  },
  {
    key: "payments.receipt_review",
    label: "receipt not reviewed",
    async find(now) {
      const rule = await limitRule("payments.receipt_review");
      const rows = await Payment.find(
        {
          channel: "receipt",
          status: "succeeded",
          review: null,
          createdAt: { $lte: rule.startedBy(now) },
        },
        { noticeNumber: 1, stationId: 1, createdAt: 1 },
      ).lean();
      return rows.map((p) => ({
        ...paymentItem(p),
        startedAt: p.createdAt,
        dueAt: rule.at(p.createdAt),
        tell: [FINANCE],
        escalate: [HQ],
      }));
    },
  },
  {
    key: "payments.refund_approve",
    label: "refund not approved",
    async find(now) {
      const rule = await limitRule("payments.refund_approve");
      const rows = await Payment.find(
        { "refund.status": "due", "refund.dueAt": { $lte: rule.startedBy(now) } },
        { noticeNumber: 1, stationId: 1, refund: 1 },
      ).lean();
      return rows.map((p) => {
        const since = /** @type {Date} */ (p.refund?.dueAt);
        return {
          ...paymentItem(p),
          startedAt: since,
          dueAt: rule.at(since),
          tell: [FINANCE],
          escalate: [HQ],
        };
      });
    },
  },
  {
    // Payout batches are weekly (D16-8): a request still waiting has missed one.
    key: "rewards.payout_batch",
    label: "payout request not paid",
    async find(now) {
      const rule = await limitRule("rewards.payout_batch");
      const rows = await Payout.find(
        { status: "requested", requestedAt: { $lte: rule.startedBy(now) } },
        { userId: 1, requestedAt: 1, amount: 1 },
      ).lean();
      return rows.map((p) => ({
        type: /** @type {const} */ ("payout"),
        id: p._id,
        number: `Payout of Rs ${p.amount}`,
        stationId: null,
        link: "/rewards/payouts",
        startedAt: p.requestedAt,
        dueAt: rule.at(p.requestedAt),
        tell: [FINANCE],
        escalate: [HQ],
      }));
    },
  },
];

/** @param {any} n */
function noticeItem(n) {
  return {
    type: /** @type {const} */ ("notice"),
    id: n._id,
    number: n.noticeNumber,
    stationId: n.stationId,
    link: `/notices/${n._id}`,
  };
}
const COURT_FIELDS = {
  courtRef: 1,
  stationId: 1,
  prosecutingOfficer: 1,
  prepareBy: 1,
  fileBy: 1,
  approvedAt: 1,
  createdAt: 1,
  hearings: 1,
};
/** @param {any} cc */
function courtItem(cc) {
  return {
    type: /** @type {const} */ ("court_case"),
    id: cc._id,
    number: cc.courtRef,
    stationId: cc.stationId,
    link: `/court/${cc._id}`,
  };
}
/** @param {any} cc @returns {Target[]} */
const prosecutorAndOic = (cc) => [{ user: cc.prosecutingOfficer?.id }, oic(cc.stationId)];
/** @param {any} p */
function paymentItem(p) {
  return {
    type: /** @type {const} */ ("payment"),
    id: p._id,
    number: p.noticeNumber,
    stationId: p.stationId,
    link: `/payments/${p._id}`,
  };
}

// ── The sweep ───────────────────────────────────────────────────────────

/**
 * Records new breaches, escalates those at twice their limit, resolves those
 * whose item moved on; then hearing reminders and stations without an OIC.
 * Run every few minutes by the server; tests call it with a chosen `now`.
 * @param {Date} [now]
 */
export async function runDeadlineSweep(now = new Date()) {
  const totals = { breached: 0, escalated: 0, resolved: 0, reminded: 0, stationsWithoutOic: 0 };
  for (const clock of CLOCKS) {
    const overdue = (await clock.find(now)).filter((o) => o.dueAt <= now);
    const current = new Set(overdue.map((o) => `${o.id}|${o.dueAt.getTime()}`));
    for (const o of overdue) {
      const r = await track(clock, o, now);
      totals.breached += r.breached;
      totals.escalated += r.escalated;
    }
    const open = await Breach.find(
      { limitKey: clock.key, resolvedAt: null },
      { item: 1, dueAt: 1 },
    ).lean();
    const done = open.filter((b) => !current.has(`${b.item.id}|${b.dueAt.getTime()}`));
    if (done.length) {
      const r = await Breach.updateMany(
        { _id: { $in: done.map((b) => b._id) } },
        { $set: { resolvedAt: now } },
      );
      totals.resolved += r.modifiedCount;
    }
  }
  totals.reminded = await remindHearings(now);
  totals.stationsWithoutOic = await stationsWithoutOic(now);
  return totals;
}

/** @param {Clock} clock @param {Overdue} o @param {Date} now */
async function track(clock, o, now) {
  let breached = 0;
  let escalated = 0;
  const where = { limitKey: clock.key, "item.id": o.id, dueAt: o.dueAt };
  /** @type {any} */
  let b = await Breach.findOne(where).lean();
  if (!b) {
    await inTransaction(async (session) => {
      const [created] = await Breach.create(
        [
          {
            limitKey: clock.key,
            label: clock.label,
            item: { type: o.type, id: o.id, number: o.number },
            stationId: o.stationId ?? null,
            link: o.link,
            startedAt: o.startedAt,
            dueAt: o.dueAt,
            escalateAt: o.escalate
              ? new Date(o.dueAt.getTime() + Math.max(o.dueAt.getTime() - o.startedAt.getTime(), 0))
              : null,
            detectedAt: now,
          },
        ],
        { session },
      );
      b = created?.toObject() ?? null;
      await notify(session, o.tell, {
        kind: `deadline.${clock.key}`,
        level: "warning",
        title: `${o.number}: ${clock.label}`,
        body: `Was due ${time.format(o.dueAt)}.`,
        link: o.link,
        group: `Overdue: ${clock.label}`,
      });
    });
    breached = 1;
  }
  if (b && o.escalate && b.escalateAt && b.escalateAt <= now && !b.escalatedAt) {
    const escalate = o.escalate;
    const id = b._id;
    await inTransaction(async (session) => {
      await Breach.updateOne({ _id: id }, { $set: { escalatedAt: now } }, { session });
      await notify(session, escalate, {
        kind: `deadline.${clock.key}.escalated`,
        level: "danger",
        title: `${o.number}: ${clock.label} — twice the time limit`,
        body: `Was due ${time.format(o.dueAt)}; now past twice its time limit.`,
        link: o.link,
        group: `Twice the time limit: ${clock.label}`,
      });
    });
    escalated = 1;
  }
  return { breached, escalated };
}

/**
 * Reminder to the prosecuting officer before each hearing (docs/06 §5) —
 * once per hearing date.
 * @param {Date} now
 */
async function remindHearings(now) {
  const days = await limitValue("court.hearing_reminder");
  const rows = await CourtCase.find(
    {
      status: { $in: ["filed", "hearing"] },
      hearings: {
        $elemMatch: {
          outcome: null,
          date: { $gt: now, $lte: new Date(now.getTime() + days * DAY) },
        },
      },
    },
    COURT_FIELDS,
  ).lean();
  let sent = 0;
  for (const cc of rows) {
    const h = cc.hearings.find((x) => !x.outcome);
    if (!h) continue;
    const to = cc.prosecutingOfficer?.id
      ? [{ user: cc.prosecutingOfficer.id }]
      : [oic(cc.stationId)];
    sent += await inTransaction((session) =>
      notify(session, to, {
        kind: "court.hearing_soon",
        title: `${cc.courtRef}: hearing on ${time.format(h.date)}`,
        body: "Prepare the witnesses and the evidence bundle.",
        link: `/court/${cc._id}`,
        key: `hearing:${cc._id}:${h.date.toISOString()}`,
      }),
    );
  }
  return sent;
}

/**
 * Verified, active stations with no active OIC (docs/09 §4): HQ
 * administrators are told at once and again each day until it is fixed. One
 * notification lists them all; a change in the list sends a new one.
 * @param {Date} now
 */
async function stationsWithoutOic(now) {
  const withOic = await User.distinct("stationId", { role: "station_oic", isActive: true });
  const rows = await Station.find(
    { isActive: true, verified: true, _id: { $nin: withOic } },
    { name: 1 },
  )
    .sort({ name: 1 })
    .lean();
  if (rows.length === 0) return 0;
  const ids = createHash("sha256")
    .update(rows.map((s) => String(s._id)).join(","))
    .digest("hex")
    .slice(0, 16);
  const names = rows.slice(0, 5).map((s) => s.name);
  const more = rows.length > 5 ? ` and ${rows.length - 5} more` : "";
  await inTransaction((session) =>
    notify(session, [{ national: ["hq_admin"] }], {
      kind: "station.no_oic",
      level: "warning",
      title:
        rows.length === 1
          ? `${rows[0]?.name} has no active OIC`
          : `${rows.length} stations have no active OIC`,
      body: `${names.join(", ")}${more}. Create or reactivate the OIC's account.`,
      link: rows.length === 1 ? `/stations/${rows[0]?._id}` : "/stations",
      key: `no-oic:${day.format(now)}:${ids}`,
    }),
  );
  return rows.length;
}

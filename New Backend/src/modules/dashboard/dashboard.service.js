// Dashboards — docs/12. One per role (D12-1): HQ "Command centre" (a
// division supervisor sees it for their division), the OIC's "My station",
// and "My work" for officers and clerks. Every figure is computed from the
// records themselves by the database (§6), within what the user may see
// (D5), with no personal data (D6). Results are cached for 60 seconds per
// role, scope and filters (D12-4).

import mongoose from "mongoose";
import { scopeOf } from "#src/core/access/permissions.js";
import { forbidden } from "#src/core/errors.js";
import { Case } from "../cases/index.js";
import { ACTIVE_STATUSES } from "../cases/case.model.js";
import { CourtCase } from "../court/court.model.js";
import { Notice } from "../notices/index.js";
import { Breach } from "../notifications/notification.model.js";
import { OffenceVersion } from "../offences/offences.model.js";
import { Station } from "../organisation/organisation.model.js";
import { Payment } from "../payments/payment.model.js";
import { Report } from "../reports/report.model.js";
import { Payout } from "../rewards/payout.model.js";
import { RewardEntry } from "../rewards/reward.model.js";
import { DEFINITIONS } from "./definitions.js";
import { dayStart, resolvePeriod } from "./period.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */
/** @typedef {import("./period.js").Period} Period */
/** @typedef {import("./definitions.js").FigureKey} FigureKey */
/**
 * @typedef {object} Scope
 * @property {"command" | "station" | "mine"} kind
 * @property {mongoose.Types.ObjectId[] | null} stationIds  null: the whole country
 * @property {boolean} national
 * @property {mongoose.Types.ObjectId} userId
 * @property {string} role
 */
/**
 * @typedef {object} Filters
 * @property {import("./period.js").PERIODS[number]} period
 * @property {string} [from]
 * @property {string} [to]
 * @property {string} [divisionId]
 * @property {string} [stationId]
 * @property {string} [channel]
 * @property {"P1" | "P2" | "P3"} [priority]
 */

const DAY = 86_400_000;
const CACHE_MS = 60_000;
/** @type {Map<string, { at: number, value: any }>} */
const cache = new Map();

/** The channels of the reports chart, in their fixed colour slots (docs/12 §8.2). */
export const CHANNEL_SERIES = [
  { key: "app", label: "Mobile app", channels: ["citizen_app"] },
  { key: "walk_in", label: "Walk-in", channels: ["walk_in"] },
  { key: "hotline", label: "Hotline / WhatsApp", channels: ["phone", "whatsapp"] },
  { key: "other", label: "Other", channels: ["officer"] },
];

// ── Scope (D5) ──────────────────────────────────────────────────────────

/** @param {Actor} actor @param {Filters} f @returns {Promise<Scope>} */
async function scopeFor(actor, f) {
  const base = { userId: actor.userId, role: actor.role };
  const id = (/** @type {any} */ v) => new mongoose.Types.ObjectId(String(v));
  if (scopeOf(actor.role, "dashboard.national")) {
    /** @type {mongoose.Types.ObjectId[] | null} */
    let stationIds = null;
    if (f.stationId && mongoose.isValidObjectId(f.stationId)) stationIds = [id(f.stationId)];
    else if (f.divisionId && mongoose.isValidObjectId(f.divisionId))
      stationIds = /** @type {mongoose.Types.ObjectId[]} */ (
        await Station.distinct("_id", { divisionId: id(f.divisionId) })
      );
    return { ...base, kind: "command", stationIds, national: !stationIds };
  }
  if (scopeOf(actor.role, "dashboard.division")) {
    const own = /** @type {mongoose.Types.ObjectId[]} */ (
      await Station.distinct("_id", { divisionId: actor.divisionId })
    );
    const one = own.find((s) => String(s) === f.stationId);
    return { ...base, kind: "command", stationIds: one ? [one] : own, national: false };
  }
  if (scopeOf(actor.role, "dashboard.station") && actor.stationId)
    return { ...base, kind: "station", stationIds: [id(actor.stationId)], national: false };
  if (scopeOf(actor.role, "dashboard.mine"))
    return {
      ...base,
      kind: "mine",
      stationIds: actor.stationId ? [id(actor.stationId)] : [],
      national: false,
    };
  throw forbidden();
}

/** @param {Scope} s @param {string} [field] */
const inScope = (s, field = "stationId") =>
  s.stationIds ? { [field]: { $in: s.stationIds } } : {};

/** @param {Scope} s @param {Filters} f */
function reportMatch(s, f) {
  /** @type {Record<string, any>} */
  const m = { ...inScope(s) };
  if (f.channel) {
    const series = CHANNEL_SERIES.find((c) => c.key === f.channel);
    m.channel = { $in: series?.channels ?? [f.channel] };
  }
  if (f.priority) m.priority = f.priority;
  return m;
}
/** @param {Scope} s @param {Filters} f */
const caseMatch = (s, f) => ({ ...inScope(s), ...(f.priority ? { priority: f.priority } : {}) });

/** @param {Date} from @param {Date} to */
const between = (from, to) => ({ $gte: from, $lt: to });

// ── Figures ─────────────────────────────────────────────────────────────

/**
 * A figure for the page: the number, what it counts (D4) and the list it
 * opens (D3).
 * @param {FigureKey} key @param {string} label @param {number} value
 * @param {{ link?: string | null, sub?: string | null, previous?: number, money?: boolean, upIsBad?: boolean, test?: boolean }} [o]
 */
function figure(key, label, value, o = {}) {
  return {
    key,
    label,
    value,
    definition: DEFINITIONS[key],
    link: o.link ?? null,
    sub: o.sub ?? null,
    previous: o.previous ?? null,
    money: Boolean(o.money),
    upIsBad: Boolean(o.upIsBad),
    test: Boolean(o.test),
  };
}

/** A throughput figure: this period and the one before. @param {Period} p @param {FigureKey} key @param {string} label @param {(from: Date, to: Date) => Promise<number>} count @param {{ money?: boolean }} [o] */
async function throughput(p, key, label, count, o = {}) {
  const [now, before] = await Promise.all([count(p.from, p.to), count(p.prevFrom, p.prevTo)]);
  return figure(key, label, now, { previous: before, ...o });
}

/** Sum of a field over matching documents. @param {mongoose.Model<any>} model @param {object} match @param {string} field */
async function sum(model, match, field) {
  const r = await model.aggregate([
    { $match: match },
    { $group: { _id: null, n: { $sum: field } } },
  ]);
  return r[0]?.n ?? 0;
}

/** Missed time limits still open in scope. @param {Scope} s @param {object} [extra] */
const openBreaches = (s, extra = {}) => ({ resolvedAt: null, ...inScope(s), ...extra });

// ── Charts ──────────────────────────────────────────────────────────────

/** Reports received over time by channel (§4.1). @param {Scope} s @param {Filters} f @param {Period} p */
async function reportsByChannel(s, f, p) {
  const format = p.bucket === "month" ? "%Y-%m" : "%Y-%m-%d";
  const rows = await Report.aggregate([
    { $match: { ...reportMatch(s, f), receivedAt: between(p.from, p.to) } },
    {
      $group: {
        _id: {
          at: { $dateToString: { format, date: "$receivedAt", timezone: "+05:30" } },
          channel: "$channel",
        },
        n: { $sum: 1 },
      },
    },
  ]);
  /** @type {Map<string, Record<string, number>>} */
  const byBucket = new Map();
  for (const bucket of buckets(p))
    byBucket.set(bucket, { app: 0, walk_in: 0, hotline: 0, other: 0 });
  for (const r of rows) {
    const series = CHANNEL_SERIES.find((c) => c.channels.includes(r._id.channel))?.key ?? "other";
    const at = byBucket.get(r._id.at);
    if (at) at[series] = (at[series] ?? 0) + r.n;
  }
  return {
    definition: DEFINITIONS.reports_by_channel,
    bucket: p.bucket,
    series: CHANNEL_SERIES.map(({ key, label }) => ({ key, label })),
    points: [...byBucket].map(([at, values]) => ({ at, ...values })),
  };
}

/** Every day (or month) of the period, in Sri Lanka time. @param {Period} p */
function buckets(p) {
  const out = [];
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" });
  if (p.bucket === "month") {
    for (let at = p.from; at < p.to; at = new Date(at.getTime() + 28 * DAY)) {
      const key = fmt.format(at).slice(0, 7);
      if (!out.includes(key)) out.push(key);
    }
    const last = fmt.format(new Date(p.to.getTime() - 1)).slice(0, 7);
    if (!out.includes(last)) out.push(last);
    return out;
  }
  for (let at = dayStart(p.from); at < p.to; at = new Date(at.getTime() + DAY))
    out.push(fmt.format(at));
  return out;
}

/** Triage results in the period (§4.1). @param {Scope} s @param {Filters} f @param {Period} p */
async function triageOutcome(s, f, p) {
  const m = reportMatch(s, f);
  const [decided, asked] = await Promise.all([
    Report.aggregate([
      {
        $match: {
          ...m,
          status: { $in: ["accepted", "merged", "rejected"] },
          "triage.decidedAt": between(p.from, p.to),
        },
      },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
    Report.countDocuments({ ...m, "triage.askedAt": between(p.from, p.to) }),
  ]);
  const n = (/** @type {string} */ k) => decided.find((d) => d._id === k)?.n ?? 0;
  return {
    definition: DEFINITIONS.triage_outcome,
    parts: [
      { key: "accepted", label: "Accepted", value: n("accepted") },
      { key: "merged", label: "Merged", value: n("merged") },
      { key: "needs_info", label: "Needs information", value: asked },
      { key: "rejected", label: "Rejected", value: n("rejected") },
    ],
  };
}

const PIPELINE = [
  ["open", "Not dispatched", "/cases?view=not_dispatched"],
  ["dispatched", "Dispatched", "/cases?view=awaiting_acceptance"],
  ["accepted", "Accepted", "/cases?view=active"],
  ["investigating", "Investigating", "/cases?view=active"],
  ["recommended", "Recommended", "/cases?view=active"],
  ["returned", "Returned to HQ", "/cases?view=returned"],
];

/** Open cases by state, in workflow order (§8.5). @param {Scope} s @param {Filters} f @param {boolean} withHq */
async function pipeline(s, f, withHq) {
  const rows = await Case.aggregate([
    { $match: { ...caseMatch(s, f), status: { $in: PIPELINE.map(([k]) => k) } } },
    { $group: { _id: "$status", n: { $sum: 1 } } },
  ]);
  return {
    definition: DEFINITIONS.pipeline,
    bars: PIPELINE.filter(([k]) => withHq || (k !== "open" && k !== "returned")).map(
      ([key, label, link]) => ({
        key,
        label,
        value: rows.find((r) => r._id === key)?.n ?? 0,
        link,
      }),
    ),
  };
}

/** The ten most frequent offences on cases opened in the period. @param {Scope} s @param {Filters} f @param {Period} p */
async function topOffences(s, f, p) {
  const rows = await Case.aggregate([
    { $match: { ...caseMatch(s, f), createdAt: between(p.from, p.to) } },
    { $unwind: "$facts.offenceCodes" },
    { $group: { _id: "$facts.offenceCodes", n: { $sum: 1 } } },
    { $sort: { n: -1, _id: 1 } },
    { $limit: 10 },
  ]);
  const names = new Map(
    (
      await OffenceVersion.find(
        { code: { $in: rows.map((r) => r._id) }, current: true },
        { code: 1, name: 1 },
      ).lean()
    ).map((o) => [o.code, o.name]),
  );
  return {
    definition: DEFINITIONS.top_offences,
    bars: rows.map((r) => ({ key: r._id, label: names.get(r._id) ?? r._id, value: r.n })),
  };
}

/**
 * Station comparison (§4.4): sorted by missed time limits, no ranking
 * colours (D12-5). Only stations with something to show.
 * @param {Scope} s @param {Period} p
 */
async function stationTable(s, p) {
  const [open, dispatches, decisions, notices, overdue] = await Promise.all([
    Case.aggregate([
      { $match: { ...inScope(s), status: { $in: ACTIVE_STATUSES } } },
      { $group: { _id: "$stationId", n: { $sum: 1 } } },
    ]),
    Case.aggregate([
      { $match: { "dispatches.at": between(p.from, p.to) } },
      { $unwind: "$dispatches" },
      {
        $match: {
          "dispatches.at": between(p.from, p.to),
          ...(s.stationIds ? { "dispatches.stationId": { $in: s.stationIds } } : {}),
        },
      },
      {
        $group: {
          _id: "$dispatches.stationId",
          total: { $sum: 1 },
          onTime: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$dispatches.acceptedAt", null] },
                    // Recorded at the station: accepted at once, with no limit to miss.
                    {
                      $or: [
                        { $eq: [{ $ifNull: ["$dispatches.acceptBy", null] }, null] },
                        { $lte: ["$dispatches.acceptedAt", "$dispatches.acceptBy"] },
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    Case.find(
      { ...inScope(s), "decision.at": between(p.from, p.to) },
      { stationId: 1, dispatches: 1, decision: 1 },
    ).lean(),
    Notice.aggregate([
      { $match: { ...inScope(s), issuedAt: between(p.from, p.to), kind: "penalty" } },
      {
        $group: {
          _id: "$stationId",
          issued: { $sum: 1 },
          paid: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] } },
        },
      },
    ]),
    Breach.aggregate([
      {
        $match: openBreaches(s, {
          stationId: s.stationIds ? { $in: s.stationIds } : { $ne: null },
        }),
      },
      { $group: { _id: "$stationId", n: { $sum: 1 } } },
    ]),
  ]);
  /** @type {Map<string, number[]>} */
  const days = new Map();
  for (const c of decisions) {
    const accepted = c.dispatches.find(
      (d) => String(d.stationId) === String(c.stationId) && d.acceptedAt,
    )?.acceptedAt;
    if (!accepted || !c.decision?.at) continue;
    const list = days.get(String(c.stationId)) ?? [];
    list.push((c.decision.at.getTime() - accepted.getTime()) / DAY);
    days.set(String(c.stationId), list);
  }
  const ids = new Set(
    [...open, ...dispatches, ...notices, ...overdue].map((r) => String(r._id)).filter(Boolean),
  );
  for (const k of days.keys()) ids.add(k);
  const stations = await Station.find({ _id: { $in: [...ids] } }, { name: 1 }).lean();
  const get = (/** @type {any[]} */ rows, /** @type {string} */ id) =>
    rows.find((r) => String(r._id) === id);
  const rows = stations.map((st) => {
    const id = String(st._id);
    const d = get(dispatches, id);
    const n = get(notices, id);
    return {
      stationId: id,
      name: st.name,
      open: get(open, id)?.n ?? 0,
      onTime: d ? { accepted: d.onTime, of: d.total } : null,
      medianDays: median(days.get(id) ?? []),
      paid: n ? { paid: n.paid, of: n.issued } : null,
      overdue: get(overdue, id)?.n ?? 0,
    };
  });
  rows.sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name));
  return { definition: DEFINITIONS.stations, rows: rows.slice(0, 25), total: rows.length };
}

/** @param {number[]} xs */
function median(xs) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
  return Math.round(m * 10) / 10;
}

/** The oldest missed time limits still open. @param {Scope} s */
async function overdueList(s) {
  const rows = await Breach.find(openBreaches(s)).sort({ dueAt: 1 }).limit(10).lean();
  return {
    definition: DEFINITIONS.overdue_list,
    items: rows.map((b) => ({
      id: String(b._id),
      number: b.item.number,
      label: b.label,
      link: b.link,
      dueAt: b.dueAt.toISOString(),
      escalated: Boolean(b.escalatedAt),
    })),
  };
}

// ── The three dashboards ────────────────────────────────────────────────

/** HQ Command centre (§4.1); a division supervisor's division (§4.4). @param {Scope} s @param {Filters} f @param {Period} p */
async function commandCentre(s, f, p) {
  const rep = reportMatch(s, f);
  const cas = caseMatch(s, f);
  const station = s.stationIds?.length === 1 ? `&stationId=${s.stationIds[0]}` : "";
  const prio = f.priority ? `&priority=${f.priority}` : "";
  const [triage, p1, triageLate, notAccepted, returned, escalated, receipts, refunds, payouts] =
    await Promise.all([
      Report.countDocuments({ ...rep, status: "pending" }),
      Report.countDocuments({ ...rep, status: "pending", priority: "P1" }),
      Breach.countDocuments(
        openBreaches(s, { limitKey: { $in: ["reports.triage_p1", "reports.triage_p2p3"] } }),
      ),
      Breach.countDocuments(openBreaches(s, { limitKey: "cases.accept" })),
      Case.countDocuments({ ...cas, status: "returned" }),
      Breach.countDocuments(openBreaches(s, { escalatedAt: { $ne: null } })),
      s.national
        ? Payment.countDocuments({ channel: "receipt", status: "succeeded", review: null })
        : 0,
      s.national ? Payment.countDocuments({ "refund.status": "due" }) : 0,
      s.national ? Payout.countDocuments({ status: "requested" }) : 0,
    ]);
  const attention = [
    figure("triage_waiting", "Reports waiting for triage", triage, {
      link: `/reports?view=triage${prio}`,
      sub: triageLate ? `${triageLate} past their limit` : null,
    }),
    figure("p1_waiting", "P1 reports waiting", p1, { link: "/reports?view=triage&priority=P1" }),
    figure("not_accepted", "Dispatches not accepted", notAccepted, {
      link: "/overdue?limit=cases.accept",
    }),
    ...(s.national || s.stationIds
      ? [
          figure("returned", "Returned to HQ", returned, {
            link: `/cases?view=returned${station}${prio}`,
          }),
        ]
      : []),
    figure("escalated", "Overdue at twice the limit", escalated, { link: "/overdue" }),
    ...(s.national
      ? [
          figure("money_waiting", "Money waiting", receipts + refunds + payouts, {
            link: "/payments?view=receipts_to_review",
            sub: `${receipts} receipts · ${refunds} refunds · ${payouts} payouts`,
          }),
        ]
      : []),
  ];

  const tp = await Promise.all([
    throughput(p, "received", "Reports received", (a, b) =>
      Report.countDocuments({ ...rep, receivedAt: between(a, b) }),
    ),
    throughput(p, "triaged", "Triaged", (a, b) =>
      Report.countDocuments({ ...rep, "triage.decidedAt": between(a, b) }),
    ),
    throughput(p, "cases_opened", "Accepted as cases", (a, b) =>
      Case.countDocuments({ ...cas, createdAt: between(a, b) }),
    ),
    throughput(p, "notices_issued", "Notices issued", (a, b) =>
      Notice.countDocuments({ ...inScope(s), issuedAt: between(a, b) }),
    ),
    throughput(p, "notices_paid", "Notices paid", (a, b) =>
      Notice.countDocuments({ ...inScope(s), status: "paid", paidAt: between(a, b) }),
    ),
    throughput(p, "court_filed", "Court cases filed", (a, b) =>
      CourtCase.countDocuments({ ...inScope(s), filedAt: between(a, b) }),
    ),
  ]);
  if (s.national) {
    tp.push(
      await throughput(p, "rewards_confirmed", "Reward points confirmed", (a, b) =>
        sum(RewardEntry, { kind: "award", confirmedAt: between(a, b) }, "$points"),
      ),
    );
    const collected =
      (/** @type {"receipt" | "online"} */ channel) =>
      (/** @type {Date} */ a, /** @type {Date} */ b) =>
        Promise.all([
          sum(Payment, { channel, status: "succeeded", receivedAt: between(a, b) }, "$amount"),
          sum(
            Payment,
            { channel, "refund.status": "refunded", "refund.refundedAt": between(a, b) },
            "$amount",
          ),
        ]).then(([inn, out]) => inn - out);
    const [real, test] = await Promise.all([
      throughput(p, "collected", "Collected", collected("receipt"), { money: true }),
      collected("online")(p.from, p.to),
    ]);
    real.sub = `+ Rs ${test.toLocaleString("en-LK")} online (TEST)`;
    tp.push(real);
  }

  const [channels, outcome, pipe, offences, stations, overdue, returnedList] = await Promise.all([
    reportsByChannel(s, f, p),
    triageOutcome(s, f, p),
    pipeline(s, f, true),
    topOffences(s, f, p),
    stationTable(s, p),
    overdueList(s),
    Case.find({ ...cas, status: "returned" }, { caseNumber: 1, updatedAt: 1, dispatches: 1 })
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean(),
  ]);
  return {
    attention,
    throughput: tp,
    charts: { channels, outcome, pipeline: pipe, offences },
    stations,
    lists: {
      overdue,
      returned: {
        definition: DEFINITIONS.returned_list,
        items: returnedList.map((c) => ({
          id: String(c._id),
          number: c.caseNumber,
          label: `Returned by ${c.dispatches.at(-1)?.stationName ?? "a station"}`,
          link: `/cases/${c._id}`,
          at: c.updatedAt.toISOString(),
        })),
      },
    },
  };
}

/** The OIC's "My station" (§4.2). @param {Scope} s @param {Filters} f @param {Period} p */
async function myStation(s, f, p) {
  const cas = caseMatch(s, f);
  const st = inScope(s);
  const week = new Date(Date.now() + 7 * DAY);
  const [toAccept, noOfficer, toDecide, disputes, toPost, court] = await Promise.all([
    Case.countDocuments({ ...cas, status: "dispatched" }),
    Case.countDocuments({
      ...cas,
      status: { $in: ["accepted", "investigating"] },
      investigatingOfficer: null,
    }),
    Case.countDocuments({ ...cas, status: "recommended", decideLevel: "oic" }),
    Notice.countDocuments({ ...st, status: "disputed" }),
    Notice.countDocuments({ ...st, status: "issued" }),
    CourtCase.countDocuments({
      ...st,
      $or: [
        { status: "referred", prepareBy: { $lte: week } },
        { status: "approved", fileBy: { $lte: week } },
        {
          status: { $in: ["filed", "hearing"] },
          hearings: { $elemMatch: { outcome: null, date: { $lte: week } } },
        },
      ],
    }),
  ]);
  const attention = [
    figure("to_accept", "Dispatches to accept", toAccept, { link: "/cases?view=to_accept" }),
    figure("needs_officer", "Without an officer", noOfficer, { link: "/cases?view=needs_officer" }),
    figure("to_decide", "Waiting for my decision", toDecide, { link: "/cases?view=to_decide" }),
    figure("disputes", "Disputes to review", disputes, { link: "/notices?view=disputes" }),
    figure("to_post", "Notices to post", toPost, { link: "/notices?view=to_post" }),
    figure("court_this_week", "Court items this week", court, { link: "/court" }),
  ];
  const stationIds = s.stationIds ?? [];
  const tp = await Promise.all([
    throughput(p, "accepted", "Accepted", async (a, b) => {
      const r = await Case.aggregate([
        { $match: { "dispatches.acceptedAt": between(a, b) } },
        { $unwind: "$dispatches" },
        {
          $match: {
            "dispatches.acceptedAt": between(a, b),
            "dispatches.stationId": { $in: stationIds },
          },
        },
        { $count: "n" },
      ]);
      return r[0]?.n ?? 0;
    }),
    throughput(p, "decided", "Decided", (a, b) =>
      Case.countDocuments({ ...cas, "decision.at": between(a, b) }),
    ),
    throughput(p, "notices_paid", "Notices paid", (a, b) =>
      Notice.countDocuments({ ...st, status: "paid", paidAt: between(a, b) }),
    ),
    throughput(p, "court_outcomes", "Court outcomes", (a, b) =>
      CourtCase.countDocuments({ ...st, "verdict.recordedAt": between(a, b) }),
    ),
  ]);
  const [pipe, offences, officers, overdue] = await Promise.all([
    pipeline(s, f, false),
    topOffences(s, f, p),
    Case.aggregate([
      { $match: { ...cas, status: { $in: ["accepted", "investigating", "recommended"] } } },
      {
        $group: {
          _id: { $ifNull: ["$investigatingOfficer.name", "No officer"] },
          open: { $sum: 1 },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$recommendBy", null] },
                    { $lt: ["$recommendBy", new Date()] },
                    { $ne: ["$status", "recommended"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { overdue: -1, open: -1, _id: 1 } },
    ]),
    overdueList(s),
  ]);
  return {
    attention,
    throughput: tp,
    charts: { pipeline: pipe, offences },
    officers: {
      definition: DEFINITIONS.officers,
      rows: officers.map((o) => ({ name: o._id, open: o.open, overdue: o.overdue })),
    },
    lists: { overdue },
  };
}

/** An officer's or clerk's "My work" (§4.3): a queue, no charts (D12-3). @param {Scope} s @param {Actor} actor */
async function myWork(s, actor) {
  const now = new Date();
  const week = new Date(now.getTime() + 7 * DAY);
  if (actor.role === "station_clerk") {
    const st = inScope(s);
    const [toPost, failed, outbox, toPrepare, queue] = await Promise.all([
      Notice.countDocuments({ ...st, status: "issued" }),
      Notice.countDocuments({ ...st, status: "service_failed" }),
      mongoose.connection.db
        ?.collection("notice_outbox")
        .countDocuments({ ...st, channel: "post", status: "queued" }) ?? 0,
      CourtCase.countDocuments({ ...st, status: "referred" }),
      Notice.find(
        { ...st, status: { $in: ["issued", "service_failed"] } },
        {
          noticeNumber: 1,
          status: 1,
          postBy: 1,
          service: 1,
        },
      )
        .sort({ postBy: 1 })
        .limit(25)
        .lean(),
    ]);
    return {
      attention: [
        figure("to_post", "Notices to post", toPost, { link: "/notices?view=to_post" }),
        figure("service_failed", "Returned by post", failed, {
          link: "/notices?view=service_failed",
        }),
        figure("outbox", "Letters to print", outbox, { link: "/notices?view=outbox" }),
        figure("court_to_prepare", "Court cases to prepare", toPrepare, {
          link: "/court?view=to_prepare",
        }),
      ],
      queue: queue.map((n) => {
        const due = n.status === "issued" ? n.postBy : n.service?.reserveBy;
        return {
          id: String(n._id),
          number: n.noticeNumber,
          label: n.status === "issued" ? "Post the notice" : "Serve it again",
          link: `/notices/${n._id}`,
          dueAt: due?.toISOString() ?? null,
          overdue: Boolean(due && due < now),
        };
      }),
    };
  }

  /** @type {Record<string, any>} */
  const me = { "investigatingOfficer.id": actor.userId };
  /** @type {Record<string, any>} */
  const open = { ...me, status: { $in: ["accepted", "investigating", "recommended"] } };
  /** @type {Record<string, any>} */
  const late = {
    ...me,
    status: { $in: ["accepted", "investigating"] },
    recommendBy: { $lt: now },
  };
  const [cases, overdue, hearings, sentBack] = await Promise.all([
    Case.find(open, { caseNumber: 1, status: 1, priority: 1, recommendBy: 1, decideBy: 1 }).lean(),
    Case.countDocuments(late),
    CourtCase.countDocuments({
      "prosecutingOfficer.id": actor.userId,
      status: { $in: ["filed", "hearing"] },
      hearings: { $elemMatch: { outcome: null, date: { $gte: now, $lte: week } } },
    }),
    Case.countDocuments({
      ...me,
      status: "investigating",
      "recommendations.sentBackAt": { $ne: null },
    }),
  ]);
  const due = (/** @type {any} */ c) => (c.status === "recommended" ? c.decideBy : c.recommendBy);
  cases.sort((a, b) => (due(a)?.getTime() ?? Infinity) - (due(b)?.getTime() ?? Infinity));
  return {
    attention: [
      figure("my_cases", "Cases assigned to me", cases.length, { link: "/cases?view=mine" }),
      figure("my_overdue", "Overdue", overdue, { link: "/cases?view=mine", upIsBad: true }),
      figure("my_hearings", "Hearings in 7 days", hearings, { link: "/court?view=hearings" }),
      figure("sent_back", "Sent back to me", sentBack, { link: "/cases?view=mine" }),
    ],
    queue: cases.map((c) => ({
      id: String(c._id),
      number: c.caseNumber,
      label:
        c.status === "recommended"
          ? "Waiting for the decision"
          : c.status === "accepted"
            ? "Start the investigation"
            : "Investigate and recommend",
      priority: c.priority,
      link: `/cases/${c._id}`,
      dueAt: due(c)?.toISOString() ?? null,
      overdue: Boolean(c.status !== "recommended" && c.recommendBy && c.recommendBy < now),
    })),
  };
}

/**
 * The user's dashboard for the filters.
 * @param {Actor} actor @param {Filters} filters
 */
export async function dashboardFor(actor, filters) {
  const scope = await scopeFor(actor, filters);
  const period = resolvePeriod(filters);
  const key = JSON.stringify([
    scope.kind,
    scope.kind === "mine" ? String(actor.userId) : (scope.stationIds ?? []).map(String),
    actor.role,
    period.key,
    filters.channel ?? null,
    filters.priority ?? null,
  ]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const body =
    scope.kind === "command"
      ? await commandCentre(scope, filters, period)
      : scope.kind === "station"
        ? await myStation(scope, filters, period)
        : await myWork(scope, actor);
  const value = {
    kind: scope.kind,
    national: scope.national,
    period: {
      key: period.key,
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      previousFrom: period.prevFrom.toISOString(),
    },
    generatedAt: new Date().toISOString(),
    ...body,
  };
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(/** @type {string} */ (cache.keys().next().value));
  return value;
}

/** For tests: forget cached dashboards. */
export const clearDashboardCache = () => cache.clear();

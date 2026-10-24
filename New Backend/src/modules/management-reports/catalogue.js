// The management reports — docs/12 §7. Each is built by the dashboard's own
// functions for the same period and scope, so a report always matches the
// dashboard (D12-7), and ends with the definitions of its figures. Counts,
// record numbers and station names only — no personal data (docs/10 §5.4).

import { Case } from "../cases/index.js";
import { CourtCase } from "../court/court.model.js";
import { commandCentre, stationTable } from "../dashboard/dashboard.service.js";
import { DEFINITIONS } from "../dashboard/definitions.js";
import { Breach } from "../notifications/notification.model.js";
import { Station } from "../organisation/organisation.model.js";
import { Payment } from "../payments/payment.model.js";
import { ReporterAccount } from "../reporters/index.js";
import { Payout } from "../rewards/payout.model.js";
import { RewardEntry } from "../rewards/reward.model.js";

/** @typedef {import("./pdf.js").Section} Section */
/** @typedef {import("../dashboard/dashboard.service.js").Scope} Scope */
/** @typedef {import("../dashboard/period.js").Period} Period */
/** @typedef {{ scope: Scope, period: Period, periodLabel: string }} BuildInput */

/**
 * @typedef {object} ReportType
 * @property {string} title
 * @property {"national" | "any"} level   national: HQ only; any: also a division or station
 * @property {"daily" | "weekly" | "monthly" | null} schedule
 * @property {string} summary
 * @property {(input: BuildInput) => Promise<Section[]>} build
 */

const n = (/** @type {number} */ v) => v.toLocaleString("en-LK");
const rs = (/** @type {number} */ v) => `Rs ${n(v)}`;
const between = (/** @type {Period} */ p) => ({ $gte: p.from, $lt: p.to });
const fmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Colombo",
});

/** "12   (previous period 9)" @param {{ value: number, previous: number | null, money: boolean }} f */
const withPrevious = (f) =>
  `${f.money ? rs(f.value) : n(f.value)}${f.previous !== null ? `   (previous period ${f.money ? rs(f.previous) : n(f.previous)})` : ""}`;

/**
 * A throughput figure with its note, as on the dashboard (the TEST money
 * beside collection).
 * @param {{ value: number, previous: number | null, money: boolean, sub: string | null }} f
 */
const activity = (f) => `${withPrevious(f)}${f.sub ? `   · ${f.sub}` : ""}`;

/**
 * The definitions of the figures a report shows (D4), as a table.
 * @param {[string, string][]} figures  label and definition key
 * @returns {Section}
 */
const definitions = (figures) => ({
  heading: "What each figure counts",
  table: {
    head: ["Figure", "Definition"],
    rows: figures.map(([label, key]) => [
      label,
      DEFINITIONS[/** @type {keyof typeof DEFINITIONS} */ (key)] ?? "",
    ]),
    align: ["left", "left"],
    wrap: 1,
  },
});
/** @param {{ key: string, label: string }[]} figures @returns {[string, string][]} */
const labelled = (figures) => figures.map((f) => [f.label, f.key]);

/** @param {{ bars: { label: string, value: number }[] }} chart @param {string} first */
const barTable = (chart, first) => ({
  head: [first, "Count"],
  rows: chart.bars.map((b) => [b.label, n(b.value)]),
});

/** Station comparison as a table (§4.4). @param {Scope} s @param {Period} p */
async function stationsSection(s, p) {
  const t = await stationTable(s, p);
  return {
    heading: "Stations",
    note: `Sorted by missed time limits; no ranking colours (D12-5). ${t.total > t.rows.length ? `The ${t.rows.length} stations with the most overdue work, of ${t.total}.` : ""}`,
    table: {
      head: [
        "Station",
        "Open cases",
        "Accepted on time",
        "Median days to decision",
        "Notices paid",
        "Overdue now",
      ],
      rows: t.rows.map((r) => [
        r.name,
        n(r.open),
        r.onTime ? `${r.onTime.accepted} of ${r.onTime.of}` : "—",
        r.medianDays === null ? "—" : String(r.medianDays),
        r.paid ? `${r.paid.paid} of ${r.paid.of}` : "—",
        n(r.overdue),
      ]),
    },
  };
}

/** @type {Record<string, ReportType>} */
export const REPORT_TYPES = {
  daily_operations: {
    title: "Daily operations summary",
    level: "national",
    schedule: "daily",
    summary: "Yesterday's activity, what needed attention, triage and the case pipeline.",
    async build({ scope, period }) {
      const c = await commandCentre(scope, { period: "custom" }, period);
      return [
        { heading: "Activity", pairs: c.throughput.map((f) => [f.label, activity(f)]) },
        {
          heading: "Needing attention when the report was made",
          pairs: c.attention.map((f) => [f.label, `${n(f.value)}${f.sub ? `   (${f.sub})` : ""}`]),
        },
        {
          heading: "Triage outcome",
          table: {
            head: ["Result", "Reports"],
            rows: c.charts.outcome.parts.map((x) => [x.label, n(x.value)]),
          },
        },
        { heading: "Case pipeline", table: barTable(c.charts.pipeline, "State") },
        { heading: "Top offences", table: barTable(c.charts.offences, "Offence") },
        definitions([
          ...labelled(c.throughput),
          ...labelled(c.attention),
          ["Triage outcome", "triage_outcome"],
          ["Case pipeline", "pipeline"],
          ["Top offences", "top_offences"],
        ]),
      ];
    },
  },

  weekly_stations: {
    title: "Weekly station performance",
    level: "any",
    schedule: "weekly",
    summary:
      "Each station's open cases, on-time acceptance, time to decision, notices paid and overdue work.",
    async build({ scope, period }) {
      return [await stationsSection(scope, period), definitions([["Stations", "stations"]])];
    },
  },

  monthly_enforcement: {
    title: "Monthly enforcement report",
    level: "national",
    schedule: "monthly",
    summary: "Offences, outcomes, collection and court results for the month.",
    async build({ scope, period }) {
      const c = await commandCentre(scope, { period: "custom" }, period);
      const [outcomes, verdicts] = await Promise.all([
        Case.aggregate([
          { $match: { "decision.at": between(period) } },
          { $group: { _id: "$decision.outcome.outcome", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
        CourtCase.aggregate([
          { $match: { "verdict.recordedAt": between(period) } },
          { $group: { _id: "$verdict.result", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
      ]);
      const words = /** @type {Record<string, string>} */ ({
        penalty_notice: "Penalty notice",
        court: "Court referral",
        warning: "Warning",
        no_further_action: "No further action",
      });
      return [
        { heading: "Activity", pairs: c.throughput.map((f) => [f.label, activity(f)]) },
        {
          heading: "Outcomes decided",
          table: {
            head: ["Outcome", "Cases"],
            rows: outcomes.map((o) => [words[o._id] ?? o._id, n(o.count)]),
          },
        },
        {
          heading: "Court verdicts recorded",
          table: {
            head: ["Verdict", "Court cases"],
            rows: verdicts.map((v) => [String(v._id), n(v.count)]),
          },
        },
        { heading: "Top offences", table: barTable(c.charts.offences, "Offence") },
        await stationsSection(scope, period),
        definitions([
          ...labelled(c.throughput),
          ["Top offences", "top_offences"],
          ["Stations", "stations"],
        ]),
      ];
    },
  },

  daily_reconciliation: {
    title: "Daily payment reconciliation",
    level: "national",
    schedule: "daily",
    summary: "Every payment, receipt and refund of the day, with totals; online payments are TEST.",
    async build({ period }) {
      const [payments, refunds] = await Promise.all([
        Payment.find({ receivedAt: between(period) })
          .sort({ receivedAt: 1 })
          .limit(5000)
          .lean(),
        Payment.find({ "refund.refundedAt": between(period) }).lean(),
      ]);
      const ok = payments.filter((p) => p.status === "succeeded");
      const sum = (/** @type {any[]} */ xs) => xs.reduce((s, p) => s + p.amount, 0);
      const receipts = ok.filter((p) => p.channel === "receipt");
      const online = ok.filter((p) => p.channel === "online");
      return [
        {
          heading: "Totals",
          pairs: [
            ["Recorded receipts", `${n(receipts.length)} · ${rs(sum(receipts))}`],
            ["Online payments (TEST — simulator)", `${n(online.length)} · ${rs(sum(online))}`],
            ["Refunded", `${n(refunds.length)} · ${rs(sum(refunds))}`],
            [
              "Receipts reversed after review",
              n(payments.filter((p) => p.status === "reversed").length),
            ],
            [
              "Online payments that failed",
              n(payments.filter((p) => p.status === "failed").length),
            ],
            [
              "Collected (receipts less refunds)",
              rs(sum(receipts) - sum(refunds.filter((p) => p.channel === "receipt"))),
            ],
          ],
        },
        {
          heading: "Payments",
          note: "Online payments come from the payment simulator and are not real money (D12-6).",
          table: {
            head: ["Time", "Reference", "Notice", "Channel", "Amount", "Status", "Flags"],
            rows: payments.map((p) => [
              fmt.format(/** @type {Date} */ (p.receivedAt)),
              p.reference ?? p.receipt?.number ?? "—",
              p.noticeNumber,
              p.channel === "online" ? "Online (TEST)" : "Receipt",
              rs(p.amount),
              p.status,
              (p.flags ?? []).join(", ") || "—",
            ]),
            align: ["left", "left", "left", "left", "right", "left", "left"],
          },
        },
        {
          heading: "Refunds",
          table: {
            head: ["Refunded", "Reference", "Notice", "Amount", "Reason"],
            rows: refunds.map((p) => [
              fmt.format(/** @type {Date} */ (p.refund?.refundedAt)),
              p.refund?.reference ?? "—",
              p.noticeNumber,
              rs(p.amount),
              p.refund?.reason ?? "—",
            ]),
            align: ["left", "left", "left", "right", "left"],
            wrap: 4,
          },
        },
        definitions([["Collected", "collected"]]),
      ];
    },
  },

  monthly_rewards: {
    title: "Monthly reward summary",
    level: "national",
    schedule: "monthly",
    summary: "Points earned, confirmed, reversed and paid out; holds and accounts under review.",
    async build({ period }) {
      const points = async (/** @type {Record<string, any>} */ match) => {
        const r = await RewardEntry.aggregate([
          { $match: { kind: "award", ...match } },
          { $group: { _id: null, points: { $sum: "$points" }, count: { $sum: 1 } } },
        ]);
        return { points: r[0]?.points ?? 0, count: r[0]?.count ?? 0 };
      };
      const [earned, confirmed, reversed, notEligible, held, payouts, frozen, excluded] =
        await Promise.all([
          points({ createdAt: between(period), status: { $ne: "not_eligible" } }),
          points({ confirmedAt: between(period) }),
          points({ status: "reversed", updatedAt: between(period) }),
          points({ status: "not_eligible", createdAt: between(period) }),
          points({ hold: { $ne: null }, status: { $in: ["pending", "confirmed"] } }),
          Payout.aggregate([
            { $match: { requestedAt: between(period) } },
            { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$amount" } } },
          ]),
          ReporterAccount.countDocuments({ "rewards.frozen": true, "rewards.excluded": false }),
          ReporterAccount.countDocuments({ "rewards.excluded": true }),
        ]);
      return [
        {
          heading: "Points",
          pairs: [
            ["Earned", `${n(earned.points)} points on ${n(earned.count)} reports`],
            ["Confirmed", `${n(confirmed.points)} points`],
            ["Reversed", `${n(reversed.points)} points on ${n(reversed.count)} reports`],
            ["Reports that couldn't earn", n(notEligible.count)],
          ],
        },
        {
          heading: "Payout requests made in the month",
          note: "Simulated: no money moves (D16-10).",
          table: {
            head: ["Status", "Requests", "Amount"],
            rows: payouts.map((p) => [String(p._id), n(p.count), rs(p.amount)]),
          },
        },
        {
          heading: "Fraud checks, at the time of the report",
          pairs: [
            ["Rewards held for review", `${n(held.count)} (${n(held.points)} points)`],
            ["Accounts with payouts frozen", n(frozen)],
            ["Accounts excluded from rewards", n(excluded)],
          ],
        },
        definitions([["Confirmed", "rewards_confirmed"]]),
      ];
    },
  },

  overdue: {
    title: "Overdue items",
    level: "any",
    schedule: null,
    summary: "Every missed time limit still open, oldest first.",
    async build({ scope }) {
      const rows = await Breach.find({
        resolvedAt: null,
        ...(scope.stationIds ? { stationId: { $in: scope.stationIds } } : {}),
      })
        .sort({ dueAt: 1 })
        .limit(5000)
        .lean();
      const names = new Map(
        (
          await Station.find(
            { _id: { $in: rows.map((b) => b.stationId).filter(Boolean) } },
            { name: 1 },
          ).lean()
        ).map((s) => [String(s._id), s.name]),
      );
      return [
        {
          heading: `${n(rows.length)} items past their time limit`,
          table: {
            head: ["Item", "What", "Station", "Was due", "Twice the limit"],
            rows: rows.map((b) => [
              b.item.number,
              b.label,
              b.stationId ? (names.get(String(b.stationId)) ?? "—") : "HQ",
              fmt.format(b.dueAt),
              b.escalatedAt ? "Yes" : "",
            ]),
            align: ["left", "left", "left", "left", "left"],
          },
        },
        definitions([["Overdue items", "overdue_list"]]),
      ];
    },
  },
};

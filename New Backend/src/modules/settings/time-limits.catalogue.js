// Every time limit — docs/09 §4, with its default. HQ can change the value
// (docs/09 T2); the label, unit and who is responsible are fixed here.
// Calendar time, 24/7, no holiday adjustment (T1).

/** @typedef {"minutes" | "hours" | "days" | "months" | "count"} Unit */

/**
 * @typedef {object} LimitDefinition
 * @property {string} key
 * @property {string} group
 * @property {string} label
 * @property {Unit} unit
 * @property {number} defaultValue
 * @property {string} responsible
 * @property {string} onBreach
 */

/** Upper bounds per unit, so a typo can't set a limit to years. */
export const MAX_BY_UNIT = { minutes: 240, hours: 720, days: 365, months: 60, count: 20 };

/** @type {LimitDefinition[]} */
export const TIME_LIMITS = [
  // Reports (docs/02)
  {
    key: "reports.triage_p1",
    group: "Reports",
    label: "Triage a P1 report",
    unit: "hours",
    defaultValue: 2,
    responsible: "HQ",
    onBreach: "HQ supervisors alerted",
  },
  {
    key: "reports.triage_p2p3",
    group: "Reports",
    label: "Triage a P2 or P3 report",
    unit: "hours",
    defaultValue: 24,
    responsible: "HQ",
    onBreach: "HQ supervisors alerted",
  },
  {
    key: "reports.needs_info_reply",
    group: "Reports",
    label: "Reporter answers “needs information”",
    unit: "days",
    defaultValue: 7,
    responsible: "Reporter",
    onBreach: "Report rejected (no response)",
  },
  {
    key: "reports.triage_lock",
    group: "Reports",
    label: "Triage lock on an open report",
    unit: "minutes",
    defaultValue: 15,
    responsible: "HQ operator",
    onBreach: "Lock released",
  },
  {
    key: "reports.abuse_window",
    group: "Reports",
    label: "Period in which false or abusive reports are counted",
    unit: "days",
    defaultValue: 90,
    responsible: "HQ",
    onBreach: "Older rejections stop counting (docs/02 §10)",
  },
  {
    key: "reports.abuse_threshold",
    group: "Reports",
    label: "False or abusive reports before the reporter is flagged",
    unit: "count",
    defaultValue: 3,
    responsible: "HQ",
    onBreach: "Reporter flagged; new reports show a warning (docs/02 §10)",
  },

  // Cases (docs/03)
  {
    key: "cases.accept",
    group: "Cases",
    label: "Station accepts a dispatch",
    unit: "hours",
    defaultValue: 24,
    responsible: "Station",
    onBreach: "Station and HQ alerted",
  },
  {
    key: "cases.accept_p1",
    group: "Cases",
    label: "Station accepts a P1 dispatch",
    unit: "hours",
    defaultValue: 2,
    responsible: "Station",
    onBreach: "Station and HQ alerted",
  },
  {
    key: "cases.work_start",
    group: "Cases",
    label: "Work starts after dispatch",
    unit: "hours",
    defaultValue: 72,
    responsible: "Investigating officer",
    onBreach: "Officer and OIC; HQ at twice the limit",
  },
  {
    key: "cases.work_start_p1",
    group: "Cases",
    label: "Work starts after a P1 dispatch",
    unit: "hours",
    defaultValue: 24,
    responsible: "Investigating officer",
    onBreach: "Officer and OIC; HQ at twice the limit",
  },
  {
    key: "cases.assign_officer",
    group: "Cases",
    label: "Investigating officer assigned after acceptance",
    unit: "hours",
    defaultValue: 24,
    responsible: "OIC",
    onBreach: "OIC; HQ at twice the limit",
  },
  {
    key: "cases.recommend",
    group: "Cases",
    label: "Recommendation after acceptance",
    unit: "days",
    defaultValue: 7,
    responsible: "Investigating officer",
    onBreach: "Officer and OIC; HQ at twice the limit",
  },
  {
    key: "cases.decide",
    group: "Cases",
    label: "Decision after recommendation",
    unit: "days",
    defaultValue: 3,
    responsible: "OIC (HQ for S2 cases)",
    onBreach: "OIC; HQ at twice the limit",
  },
  {
    key: "vehicles.owner_recheck",
    group: "Cases",
    label: "A traced owner can be reused without re-checking for",
    unit: "months",
    defaultValue: 6,
    responsible: "Investigating officer",
    onBreach: "The officer re-checks the owner with the registry (docs/04 V2)",
  },

  // Penalty notices (docs/05)
  {
    key: "notices.post",
    group: "Penalty notices",
    label: "Notice posted after the decision",
    unit: "days",
    defaultValue: 3,
    responsible: "Station",
    onBreach: "OIC; HQ at twice the limit",
  },
  {
    key: "notices.deemed_served",
    group: "Penalty notices",
    label: "Deemed served after posting",
    unit: "days",
    defaultValue: 3,
    responsible: "—",
    onBreach: "Response period starts",
  },
  {
    key: "notices.respond",
    group: "Penalty notices",
    label: "Pay, name the driver or dispute, from service",
    unit: "days",
    defaultValue: 14,
    responsible: "Addressee",
    onBreach: "Reminder sent; final date set",
  },
  {
    key: "notices.final_after_reminder",
    group: "Penalty notices",
    label: "Final date after the reminder",
    unit: "days",
    defaultValue: 7,
    responsible: "Addressee",
    onBreach: "Court referral proposed to the OIC",
  },
  {
    key: "notices.dispute_review",
    group: "Penalty notices",
    label: "Dispute reviewed",
    unit: "days",
    defaultValue: 7,
    responsible: "OIC",
    onBreach: "OIC; HQ at twice the limit",
  },
  {
    key: "notices.after_dispute",
    group: "Penalty notices",
    label: "Time to pay after a rejected dispute",
    unit: "days",
    defaultValue: 7,
    responsible: "Addressee",
    onBreach: "Overdue; court proposed (docs/05 §6.3)",
  },
  {
    key: "notices.reserve",
    group: "Penalty notices",
    label: "Re-serve after service failed",
    unit: "days",
    defaultValue: 7,
    responsible: "Investigating officer",
    onBreach: "OIC; HQ at twice the limit",
  },

  // Court (docs/06)
  {
    key: "court.prepare",
    group: "Court",
    label: "Prepare after referral",
    unit: "days",
    defaultValue: 14,
    responsible: "Prosecuting officer",
    onBreach: "Officer and OIC",
  },
  {
    key: "court.file",
    group: "Court",
    label: "File after approval",
    unit: "days",
    defaultValue: 14,
    responsible: "Prosecuting officer",
    onBreach: "Officer and OIC; HQ at twice the limit",
  },
  {
    key: "court.hearing_reminder",
    group: "Court",
    label: "Reminder before a hearing",
    unit: "days",
    defaultValue: 3,
    responsible: "—",
    onBreach: "Reminder to the prosecuting officer",
  },
  {
    key: "court.outcome_recorded",
    group: "Court",
    label: "Hearing outcome recorded",
    unit: "days",
    defaultValue: 2,
    responsible: "Prosecuting officer",
    onBreach: "Officer and OIC",
  },
  {
    key: "court.max_postponements",
    group: "Court",
    label: "Postponements before HQ is told",
    unit: "count",
    defaultValue: 5,
    responsible: "—",
    onBreach: "HQ flagged",
  },

  // Payments and rewards (docs/07, docs/16)
  {
    key: "payments.pending",
    group: "Payments and rewards",
    label: "Pending (“bank delay”) payment",
    unit: "hours",
    defaultValue: 24,
    responsible: "—",
    onBreach: "Marked failed",
  },
  {
    key: "payments.receipt_review",
    group: "Payments and rewards",
    label: "Recorded receipt reviewed",
    unit: "days",
    defaultValue: 3,
    responsible: "Finance",
    onBreach: "Finance alerted",
  },
  {
    key: "payments.refund_approve",
    group: "Payments and rewards",
    label: "Refund approved",
    unit: "days",
    defaultValue: 5,
    responsible: "Finance",
    onBreach: "Finance alerted",
  },
  {
    key: "rewards.payout_batch",
    group: "Payments and rewards",
    label: "Payout request paid in a batch",
    unit: "days",
    defaultValue: 7,
    responsible: "Finance",
    onBreach: "Finance alerted; HQ at 2×",
  },
  {
    key: "rewards.points_expiry",
    group: "Payments and rewards",
    label: "Confirmed reward points expire after",
    unit: "months",
    defaultValue: 12,
    responsible: "—",
    onBreach: "Points expire (citizen warned 30 days before)",
  },

  // System
  {
    key: "system.evidence_unclaimed",
    group: "System",
    label: "Unclaimed evidence uploads deleted after",
    unit: "hours",
    defaultValue: 24,
    responsible: "—",
    onBreach: "Deleted",
  },
  {
    key: "system.video_stuck",
    group: "System",
    label: "Stuck video processing marked failed after",
    unit: "hours",
    defaultValue: 2,
    responsible: "—",
    onBreach: "Marked failed",
  },
];

export const LIMITS_BY_KEY = new Map(TIME_LIMITS.map((l) => [l.key, l]));

const MINUTE = 60_000;
const UNIT_MS = { minutes: MINUTE, hours: 60 * MINUTE, days: 24 * 60 * MINUTE };

/**
 * When a limit runs out, counted from `start`. Months add calendar months.
 * @param {Date} start @param {number} value @param {Unit} unit
 */
export function addLimit(start, value, unit) {
  if (unit === "months") {
    const d = new Date(start);
    d.setMonth(d.getMonth() + value);
    return d;
  }
  if (unit === "count") throw new Error("A count is not a duration.");
  return new Date(start.getTime() + value * UNIT_MS[unit]);
}

// Every time limit — docs/09-time-limits-and-notifications.md §4.
//
// T1: calendar time, 24/7. T2: every limit is a setting, changed by HQ only,
// audited, and a change applies only to items that START after it — so the
// limit for an item is the value in force when the item started (`limitAt`
// on the API). T4: escalation to HQ at `escalationMultiplier` × the limit.

import { z } from "zod";

export type TimeUnit = "minutes" | "hours" | "days" | "months" | "count";

export interface TimeLimitDefinition {
  key: string;
  group:
    | "Reports"
    | "Cases"
    | "Penalty notices"
    | "Court"
    | "Payments and rewards"
    | "System"
    | "Escalation";
  label: string;
  /** Who must act, or "—" for automatic periods. */
  responsible: string;
  unit: TimeUnit;
  default: number;
  min: number;
  max: number;
  /** Document section that defines it. */
  source: string;
}

const d = <K extends string>(
  key: K,
  group: TimeLimitDefinition["group"],
  label: string,
  responsible: string,
  unit: TimeUnit,
  def: number,
  min: number,
  max: number,
  source: string,
): TimeLimitDefinition & { key: K } => ({
  key,
  group,
  label,
  responsible,
  unit,
  default: def,
  min,
  max,
  source,
});

export const TIME_LIMITS = [
  // Reports (02)
  d("report.triageP1", "Reports", "Triage a P1 report", "HQ", "hours", 2, 1, 24, "09 §4, 02 §8"),
  d("report.triage", "Reports", "Triage a P2/P3 report", "HQ", "hours", 24, 2, 168, "09 §4, 02 §8"),
  d(
    "report.needsInfoReply",
    "Reports",
    "Reporter answers “needs information”",
    "Reporter",
    "days",
    7,
    1,
    30,
    "09 §4, 02 §6.3",
  ),
  d(
    "report.triageLock",
    "Reports",
    "Triage lock on an open report",
    "HQ user",
    "minutes",
    15,
    5,
    60,
    "09 §4, 02 §5",
  ),
  // Cases (03)
  d(
    "case.acceptP1",
    "Cases",
    "Station accepts a P1 dispatch",
    "Station",
    "hours",
    2,
    1,
    24,
    "09 §4, 03 §5.3",
  ),
  d(
    "case.accept",
    "Cases",
    "Station accepts a dispatch",
    "Station",
    "hours",
    24,
    2,
    168,
    "09 §4, 03 §5.3",
  ),
  d(
    "case.workStartP1",
    "Cases",
    "Work starts after a P1 dispatch",
    "Investigating officer",
    "hours",
    24,
    2,
    168,
    "09 §4",
  ),
  d(
    "case.workStart",
    "Cases",
    "Work starts after dispatch",
    "Investigating officer",
    "hours",
    72,
    12,
    336,
    "09 §4",
  ),
  d(
    "case.assignOfficer",
    "Cases",
    "Investigating officer assigned",
    "OIC",
    "hours",
    24,
    2,
    168,
    "09 §4, 03 §6",
  ),
  d(
    "case.recommend",
    "Cases",
    "Recommendation after acceptance",
    "Investigating officer",
    "days",
    7,
    1,
    60,
    "09 §4, 05 §3",
  ),
  d(
    "case.decide",
    "Cases",
    "Decision after recommendation",
    "OIC (HQ for S2)",
    "days",
    3,
    1,
    30,
    "09 §4, 05 §4",
  ),
  // Penalty notices (05)
  d(
    "notice.post",
    "Penalty notices",
    "Notice posted after decision",
    "Station",
    "days",
    3,
    1,
    14,
    "09 §4, 05 §5.1",
  ),
  d(
    "notice.deemedServed",
    "Penalty notices",
    "Deemed served after posting",
    "—",
    "days",
    3,
    1,
    14,
    "09 §4, 05 §5.1",
  ),
  d(
    "notice.respond",
    "Penalty notices",
    "Respond (pay, nominate or dispute)",
    "Addressee",
    "days",
    14,
    7,
    60,
    "09 §4, 05 §6",
  ),
  d(
    "notice.finalAfterReminder",
    "Penalty notices",
    "Final date after reminder",
    "Addressee",
    "days",
    7,
    1,
    30,
    "09 §4, 05 §6.4",
  ),
  d(
    "notice.disputeReview",
    "Penalty notices",
    "Dispute reviewed",
    "OIC",
    "days",
    7,
    1,
    30,
    "09 §4, 05 §6.3",
  ),
  d(
    "notice.reServe",
    "Penalty notices",
    "Re-serve after service failed",
    "Investigating officer",
    "days",
    7,
    1,
    30,
    "09 §4, 05 §5.1",
  ),
  // Court (06)
  d(
    "court.prepare",
    "Court",
    "Prepare after referral",
    "Prosecuting officer",
    "days",
    14,
    1,
    60,
    "09 §4, 06 §5",
  ),
  d(
    "court.file",
    "Court",
    "File after approval",
    "Prosecuting officer",
    "days",
    14,
    1,
    60,
    "09 §4, 06 §5",
  ),
  d("court.hearingReminder", "Court", "Reminder before a hearing", "—", "days", 3, 1, 14, "09 §4"),
  d(
    "court.outcomeRecorded",
    "Court",
    "Hearing outcome recorded",
    "Prosecuting officer",
    "days",
    2,
    1,
    14,
    "09 §4",
  ),
  d(
    "court.maxPostponements",
    "Court",
    "Postponements before HQ is flagged",
    "—",
    "count",
    5,
    1,
    20,
    "09 §4, 06 §8",
  ),
  // Payments and rewards (07, 16)
  d(
    "payment.pendingTimeout",
    "Payments and rewards",
    "Pending (bank delay) payment marked failed",
    "—",
    "hours",
    24,
    1,
    168,
    "09 §4, 07 §12",
  ),
  d(
    "payment.receiptReview",
    "Payments and rewards",
    "Recorded receipt reviewed",
    "HQ",
    "days",
    3,
    1,
    30,
    "09 §4, 07 §6",
  ),
  d(
    "payment.refundApproval",
    "Payments and rewards",
    "Refund approved",
    "HQ",
    "days",
    5,
    1,
    30,
    "09 §4, 07 §8",
  ),
  d(
    "rewards.pointsExpiry",
    "Payments and rewards",
    "Confirmed reward points expire",
    "—",
    "months",
    12,
    6,
    36,
    "09 §4, 16",
  ),
  // System (built)
  d(
    "system.unclaimedUploads",
    "System",
    "Unclaimed evidence uploads deleted",
    "—",
    "hours",
    24,
    1,
    168,
    "09 §4",
  ),
  d(
    "system.stuckVideoProcessing",
    "System",
    "Stuck video processing marked failed",
    "—",
    "hours",
    2,
    1,
    24,
    "09 §4",
  ),
  // Escalation (T4, N2)
  d(
    "escalation.multiplier",
    "Escalation",
    "Escalate to HQ at this many times the limit",
    "—",
    "count",
    2,
    2,
    5,
    "09 §3 T4",
  ),
  d(
    "notifications.groupThreshold",
    "Escalation",
    "Similar alerts in an hour before grouping",
    "—",
    "count",
    10,
    3,
    100,
    "09 §6 N2",
  ),
] as const satisfies readonly TimeLimitDefinition[];

export type TimeLimitKey = (typeof TIME_LIMITS)[number]["key"];

export const TIME_LIMIT_BY_KEY: Record<TimeLimitKey, TimeLimitDefinition> = Object.fromEntries(
  TIME_LIMITS.map((t) => [t.key, t]),
) as Record<TimeLimitKey, TimeLimitDefinition>;

export function isTimeLimitKey(value: unknown): value is TimeLimitKey {
  return (
    typeof value === "string" && Object.prototype.hasOwnProperty.call(TIME_LIMIT_BY_KEY, value)
  );
}

/** Converts a value in the limit's unit to milliseconds (calendar time, T1). */
export function toMilliseconds(unit: TimeUnit, value: number): number {
  switch (unit) {
    case "minutes":
      return value * 60_000;
    case "hours":
      return value * 3_600_000;
    case "days":
      return value * 86_400_000;
    case "months":
      return value * 30 * 86_400_000;
    case "count":
      throw new Error("A count is not a duration");
  }
}

export function formatLimit(unit: TimeUnit, value: number): string {
  if (unit === "count") return String(value);
  const singular = unit.slice(0, -1);
  return `${value} ${value === 1 ? singular : unit}`;
}

export const updateTimeLimitSchema = z.object({
  value: z.coerce.number().int("Use a whole number."),
  reason: z.string().trim().min(5, "Give a reason.").max(500),
});
export type UpdateTimeLimitInput = z.input<typeof updateTimeLimitSchema>;

export interface TimeLimitView extends TimeLimitDefinition {
  value: number;
  /** When the current value took effect; null when it is still the default. */
  effectiveFrom: string | null;
  changedBy: string | null;
}

export interface TimeLimitChangeView {
  value: number;
  previous: number;
  effectiveFrom: string;
  changedBy: string;
  reason: string;
}

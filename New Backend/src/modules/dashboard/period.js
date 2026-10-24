// The dashboard period (docs/12 §5, D7): today, 7 or 30 days, this or last
// month, or a custom range up to 24 months — always in Sri Lanka time
// (UTC+05:30, no daylight saving). Each period is compared with the one of
// the same length just before it.

import { validationError } from "#src/core/errors.js";

const DAY = 86_400_000;
const COLOMBO = 5.5 * 3_600_000;
const MAX_DAYS = 731;

export const PERIODS = /** @type {const} */ ([
  "today",
  "7d",
  "30d",
  "this_month",
  "last_month",
  "custom",
]);

/** Midnight in Sri Lanka at or before `at`. @param {Date} at */
export const dayStart = (at) =>
  new Date(Math.floor((at.getTime() + COLOMBO) / DAY) * DAY - COLOMBO);

/** The first moment of the Sri Lankan month of `at`, moved by `months`. @param {Date} at @param {number} [months] */
function monthStart(at, months = 0) {
  const local = new Date(at.getTime() + COLOMBO);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + months, 1) - COLOMBO);
}

/** "2026-10-24" in Sri Lanka → that day's midnight there. @param {string} ymd */
const fromYmd = (ymd) => new Date(`${ymd}T00:00:00+05:30`);

/**
 * @typedef {object} Period
 * @property {string} key
 * @property {Date} from
 * @property {Date} to        exclusive
 * @property {Date} prevFrom
 * @property {Date} prevTo
 * @property {"day" | "month"} bucket  for charts over time
 */

/**
 * @param {{ period: typeof PERIODS[number], from?: string, to?: string }} q
 * @param {Date} [now]
 * @returns {Period}
 */
export function resolvePeriod(q, now = new Date()) {
  let from;
  let to = now;
  switch (q.period) {
    case "today":
      from = dayStart(now);
      break;
    case "7d":
      from = new Date(dayStart(now).getTime() - 6 * DAY);
      break;
    case "this_month":
      from = monthStart(now);
      break;
    case "last_month":
      from = monthStart(now, -1);
      to = monthStart(now);
      break;
    case "custom": {
      if (!q.from || !q.to) throw validationError({ from: "Choose both dates." });
      from = fromYmd(q.from);
      to = new Date(fromYmd(q.to).getTime() + DAY);
      if (to <= from) throw validationError({ to: "The end date is before the start." });
      if (to.getTime() - from.getTime() > MAX_DAYS * DAY)
        throw validationError({ to: "Choose up to 24 months." });
      break;
    }
    default:
      from = new Date(dayStart(now).getTime() - 29 * DAY);
  }
  const length = to.getTime() - from.getTime();
  return {
    key: q.period === "custom" ? `${q.from}..${q.to}` : q.period,
    from,
    to,
    prevFrom: new Date(from.getTime() - length),
    prevTo: from,
    bucket: length > 92 * DAY ? "month" : "day",
  };
}

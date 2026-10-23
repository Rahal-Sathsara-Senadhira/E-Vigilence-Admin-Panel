// Content rules — docs/13 §8: "18 Oct 2026, 08:15" in Sri Lanka time;
// relative times only alongside the full date.

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Colombo",
});

/** @param {string | Date | null | undefined} value */
export function formatDateTime(value) {
  if (!value) return "—";
  return DATE_TIME.format(new Date(value)).replace(" at ", ", ");
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
/** @type {[Intl.RelativeTimeFormatUnit, number][]} */
const STEPS = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "3 hours ago" — show with the full date beside it or on hover. @param {string | Date | null | undefined} value */
export function formatRelative(value) {
  if (!value) return "Never";
  const seconds = (new Date(value).getTime() - Date.now()) / 1000;
  for (const [unit, size] of STEPS) {
    if (Math.abs(seconds) >= size) return RELATIVE.format(Math.round(seconds / size), unit);
  }
  return "Just now";
}

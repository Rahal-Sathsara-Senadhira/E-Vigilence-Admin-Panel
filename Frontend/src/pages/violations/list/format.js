// Display helpers shared by the Violations table and mobile cards.

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const UNITS = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

// "3 hours ago", "yesterday", "just now".
export function relativeTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const seconds = (date.getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export function fullDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

// Citizen reports carry a readable address; HQ-entered ones only DMS
// coordinates. First line of whichever exists.
export function placeOf(v) {
  const place = v.address ?? v.location?.address ?? null;
  if (place) return place.split("\n")[0];
  return v.location?.dms ?? v.location_text ?? null;
}

export function coordsOf(v) {
  const lat = Number(v.location?.lat ?? v.lat);
  const lng = Number(v.location?.lng ?? v.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function offenceNames(v) {
  return (Array.isArray(v.violations) ? v.violations : [])
    .map((o) => (typeof o === "object" ? o?.name : null))
    .filter(Boolean);
}

export const isDuplicate = (v) =>
  Array.isArray(v.possibleDuplicateOf) && v.possibleDuplicateOf.length > 0;

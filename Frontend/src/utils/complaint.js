// Client-side mirror of the backend's complaint rules
// (Backend/src/utils/plate.js, phone.js, complaintOptions.js) — used for
// instant feedback while typing. The backend re-checks everything.

export const MAX_INCIDENT_AGE_DAYS = 30;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 2000;

export const CHANNELS = [
  { value: "phone", label: "Phone call" },
  { value: "walk_in", label: "Walk-in" },
  { value: "officer", label: "Officer observed" },
  { value: "other", label: "Other" },
];

const PROVINCES = ["WP", "CP", "SP", "NW", "NC", "NP", "EP", "UP", "SG"];
const WITH_PROVINCE = new RegExp(`^(${PROVINCES.join("|")})([A-Z]{2,3})(\\d{4})$`);
const LETTERS = /^([A-Z]{2,3})(\d{4})$/;
const NUMERIC = /^(\d{1,3})(\d{4})$/;

// "wp cab 4521" → "WP CAB-4521"; null if not a Sri Lankan plate.
export function normalizePlate(input) {
  const compact = String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact) return null;
  let m = WITH_PROVINCE.exec(compact);
  if (m) return `${m[1]} ${m[2]}-${m[3]}`;
  m = LETTERS.exec(compact);
  if (m) return `${m[1]}-${m[2]}`;
  m = NUMERIC.exec(compact);
  if (m) return `${m[1]}-${m[2]}`;
  return null;
}

// "077 123 4567" → "+94771234567"; null if not a Sri Lankan number.
export function normalizePhone(input) {
  let d = String(input ?? "").replace(/[^\d+]/g, "");
  if (!d) return null;
  if (d.startsWith("+94")) d = d.slice(3);
  else if (d.startsWith("0094")) d = d.slice(4);
  else if (d.startsWith("94") && d.length === 11) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  return /^[1-9]\d{8}$/.test(d) ? `+94${d}` : null;
}

// "+94771234567" → "077 123 4567" for display.
export function formatPhone(e164) {
  if (!e164) return "";
  const n = e164.replace("+94", "0");
  return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

export const SRI_LANKA_BOUNDS = { minLat: 5.85, maxLat: 9.9, minLng: 79.5, maxLng: 81.95 };

export function isInSriLanka(lat, lng) {
  const b = SRI_LANKA_BOUNDS;
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

// <input type="datetime-local"> value for a Date, in local time.
export function toLocalInput(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Which evidence kind a picked file belongs to, from its type.
export function evidenceKindOf(file) {
  const t = file?.type || "";
  if (t.startsWith("image/")) return "images";
  if (t.startsWith("video/")) return "videos";
  if (t.startsWith("audio/")) return "audios";
  return null;
}

// Largest file accepted per kind, before compression (videos and long
// recordings are compressed on the server after upload).
export const EVIDENCE_LIMIT_MB = { images: 25, videos: 500, audios: 100 };

export function formatBytes(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

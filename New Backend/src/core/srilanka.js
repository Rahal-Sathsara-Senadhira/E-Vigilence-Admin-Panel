// Sri Lankan identifiers in one canonical form each, so "wp cab 1234" and
// "WPCAB1234" are the same vehicle and "077 123 4567" the same phone.

/**
 * Phone numbers as +94 and the 9-digit national number. Accepts 0771234567,
 * 077 123 4567, 771234567, +94771234567, 0094771234567.
 * @param {unknown} input @returns {string | null}
 */
export function normalizePhone(input) {
  if (input === null || input === undefined) return null;
  let digits = String(input).replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+94")) digits = digits.slice(3);
  else if (digits.startsWith("0094")) digits = digits.slice(4);
  else if (digits.startsWith("94") && digits.length === 11) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return /^[1-9]\d{8}$/.test(digits) ? `+94${digits}` : null;
}

/**
 * National Identity Card numbers: old format 9 digits + V or X, new format
 * 12 digits. @param {unknown} input @returns {string | null}
 */
export function normalizeNic(input) {
  if (input === null || input === undefined) return null;
  const value = String(input).replace(/\s+/g, "").toUpperCase();
  if (/^\d{9}[VX]$/.test(value)) return value;
  if (/^(19|20)\d{10}$/.test(value)) return value;
  return null;
}

export const PROVINCE_CODES = ["WP", "CP", "SP", "NW", "NC", "NP", "EP", "UP", "SG"];
const WITH_PROVINCE = new RegExp(`^(${PROVINCE_CODES.join("|")})([A-Z]{2,3})(\\d{4})$`);
const LETTERS = /^([A-Z]{2,3})(\d{4})$/;
const NUMERIC = /^(\d{1,3})(\d{4})$/;

/**
 * Vehicle plates as "WP CAB-1234", "CAB-1234" or "250-1234".
 * @param {unknown} input @returns {string | null} null when it isn't a Sri Lankan plate
 */
export function normalizePlate(input) {
  if (input === null || input === undefined) return null;
  const compact = String(input)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!compact) return null;
  let m = WITH_PROVINCE.exec(compact);
  if (m) return `${m[1]} ${m[2]}-${m[3]}`;
  m = LETTERS.exec(compact);
  if (m) return `${m[1]}-${m[2]}`;
  m = NUMERIC.exec(compact);
  if (m) return `${m[1]}-${m[2]}`;
  return null;
}

/** Shows only the last `visible` characters — docs/10 §5.3. @param {string | null | undefined} value */
export function mask(value, visible = 4) {
  if (!value) return "";
  if (value.length <= visible) return value;
  return "*".repeat(value.length - visible) + value.slice(-visible);
}

/** "RP-2026-000123" from a counter value. @param {string} prefix @param {number} n @param {Date} [at] */
export const recordNumber = (prefix, n, at = new Date()) =>
  `${prefix}-${at.getFullYear()}-${String(n).padStart(6, "0")}`;

// Sri Lankan identifiers in one canonical form each.

/**
 * Phone numbers as +94 followed by the 9-digit national number. Accepts the
 * ways people type them: 0771234567, 077 123 4567, 771234567,
 * +94771234567, 0094771234567. Returns null when it isn't a valid number.
 */
export function normalizePhone(input: unknown): string | null {
  if (input == null) return null;
  let digits = String(input).replace(/[^\d+]/g, "");
  if (!digits) return null;

  if (digits.startsWith("+94")) digits = digits.slice(3);
  else if (digits.startsWith("0094")) digits = digits.slice(4);
  else if (digits.startsWith("94") && digits.length === 11) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.slice(1);

  return /^[1-9]\d{8}$/.test(digits) ? `+94${digits}` : null;
}

/**
 * National Identity Card numbers — docs/04 §4: old format is 9 digits plus
 * V or X (e.g. 852345678V), new format is 12 digits (e.g. 198523405678).
 * Returns the upper-cased, space-free form, or null when invalid.
 */
export function normalizeNic(input: unknown): string | null {
  if (input == null) return null;
  const value = String(input).replace(/\s+/g, "").toUpperCase();
  if (/^\d{9}[VX]$/.test(value)) return value;
  if (/^(19|20)\d{10}$/.test(value)) return value;
  return null;
}

export const PROVINCE_CODES = ["WP", "CP", "SP", "NW", "NC", "NP", "EP", "UP", "SG"] as const;

const WITH_PROVINCE = new RegExp(`^(${PROVINCE_CODES.join("|")})([A-Z]{2,3})(\\d{4})$`);
const LETTERS = /^([A-Z]{2,3})(\d{4})$/;
const NUMERIC = /^(\d{1,3})(\d{4})$/;

/**
 * Vehicle plates in one canonical spelling — "WP CAB-1234", "CAB-1234" or
 * "250-1234" — so "wp cab 1234" and "WPCAB1234" are the same vehicle.
 * Returns null when the input isn't a Sri Lankan plate.
 */
export function normalizePlate(input: unknown): string | null {
  if (input == null) return null;
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

/** Masks all but the last `visible` characters — docs/10 §5.3. */
export function mask(value: string | null | undefined, visible = 4): string {
  if (!value) return "";
  if (value.length <= visible) return value;
  return "*".repeat(value.length - visible) + value.slice(-visible);
}

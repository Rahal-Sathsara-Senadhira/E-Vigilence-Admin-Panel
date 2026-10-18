// Sri Lankan phone numbers, stored in one format: +94 followed by the
// 9-digit national number (mobiles start with 7, landlines with the area
// code). Accepts the ways people actually type them: 0771234567,
// 077 123 4567, 771234567, +94771234567, 0094771234567.
export function normalizeSriLankanPhone(input) {
  if (input == null) return null;
  let digits = String(input).replace(/[^\d+]/g, "");
  if (!digits) return null;

  if (digits.startsWith("+94")) digits = digits.slice(3);
  else if (digits.startsWith("0094")) digits = digits.slice(4);
  else if (digits.startsWith("94") && digits.length === 11) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.slice(1);

  // National number: 9 digits, never starting with 0.
  return /^[1-9]\d{8}$/.test(digits) ? `+94${digits}` : null;
}

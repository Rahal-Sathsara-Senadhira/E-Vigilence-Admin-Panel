// Sri Lankan vehicle number plates — one canonical spelling per plate, so
// "wp cab 4521", "WP CAB-4521" and "WPCAB4521" are the same vehicle for
// search, duplicate detection and history. Used by the staff create path,
// the citizen-report sync, the duplicate check and list search.
//
// Accepted formats (anything else is not a Sri Lankan plate):
//   WP CAB-1234   province code + 2–3 letters + 4 digits
//   CAB-1234      2–3 letters + 4 digits (province code omitted)
//   250-1234      1–3 digits + 4 digits (older all-numeric series)
//
// Province codes: Western, Central, Southern, North Western, North Central,
// Northern, Eastern, Uva, Sabaragamuwa.

export const PROVINCE_CODES = ["WP", "CP", "SP", "NW", "NC", "NP", "EP", "UP", "SG"];

const WITH_PROVINCE = new RegExp(`^(${PROVINCE_CODES.join("|")})([A-Z]{2,3})(\\d{4})$`);
const LETTERS = /^([A-Z]{2,3})(\d{4})$/;
const NUMERIC = /^(\d{1,3})(\d{4})$/;

// Canonical plate ("WP CAB-1234", "CAB-1234", "250-1234"), or null if the
// input isn't a valid Sri Lankan plate.
export function normalizePlate(input) {
  if (input == null) return null;
  const compact = String(input).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact) return null;

  let m = WITH_PROVINCE.exec(compact);
  if (m) return `${m[1]} ${m[2]}-${m[3]}`;

  m = LETTERS.exec(compact);
  if (m) return `${m[1]}-${m[2]}`;

  m = NUMERIC.exec(compact);
  if (m) return `${m[1]}-${m[2]}`;

  return null;
}

// For data that isn't validated (citizen reports, legacy rows): the
// canonical plate when it parses, otherwise the trimmed upper-case original
// so nothing the citizen typed is lost.
export function normalizePlateLoose(input) {
  if (input == null || String(input).trim() === "") return null;
  return normalizePlate(input) ?? String(input).trim().toUpperCase();
}

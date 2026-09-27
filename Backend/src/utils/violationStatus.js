// Single source of truth for Violation.status — used by validation, the
// HQ-facing update path, and the station-facing update path. Previously each
// of those three places had its own idea of what statuses mean, and the HQ
// path silently collapsed pending/verified/rejected into open/resolved.

export const ALLOWED_STATUSES = new Set([
  "open",
  "pending",
  "in_review",
  "resolved",
  "verified",
  "rejected",
]);

const ALIASES = {
  under_review: "in_review",
  closed: "resolved",
};

/**
 * Normalizes a status string (trim/lowercase, map known aliases). Returns
 * null if the input doesn't resolve to one of ALLOWED_STATUSES.
 */
export function normalizeStatus(input, fallback = null) {
  if (!input) return fallback;

  const s = String(input).trim().toLowerCase();
  const mapped = ALIASES[s] || s;

  return ALLOWED_STATUSES.has(mapped) ? mapped : fallback;
}

// Bridge to the citizen app's 3-value status (owned by the separate
// E-Vigilance-Client repo, shared `reports` collection — see
// db/providers/mongo/models/CitizenReport.js). Used only at the two points
// where the two vocabularies actually meet: importing a citizen report
// (fromCitizenStatus) and writing HQ/station progress back to it
// (toCitizenStatus).

export function fromCitizenStatus(citizenStatus) {
  switch (citizenStatus) {
    case "Completed":
      return "resolved";
    case "Rejected":
      return "rejected";
    case "In Progress":
    default:
      return "open";
  }
}

export function toCitizenStatus(status) {
  switch (status) {
    case "resolved":
    case "verified":
      return "Completed";
    case "rejected":
      return "Rejected";
    case "open":
    case "pending":
    case "in_review":
    default:
      return "In Progress";
  }
}

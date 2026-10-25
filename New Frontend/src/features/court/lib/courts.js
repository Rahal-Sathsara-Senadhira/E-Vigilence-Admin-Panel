// Courts as staff see them: their kinds, and grouped by district so a long
// list (every Magistrate's Court in the country) stays easy to use.

/** @typedef {import("../api.js").CourtRow} CourtRow */

/** Kinds of court, as staff read them (backend court.model.js COURT_TYPES). */
export const COURT_TYPE_LABELS = /** @type {Record<CourtRow["type"], string>} */ ({
  magistrate: "Magistrate's Court",
  district_magistrate: "District & Magistrate's Court",
  circuit_magistrate: "Circuit Magistrate's Court",
  children_magistrate: "Children's Magistrate's Court",
});

const NO_DISTRICT = "District not set";

/**
 * Courts grouped by district, districts and courts in order; courts without
 * a district come last. @param {CourtRow[]} courts @returns {[string, CourtRow[]][]}
 */
export function byDistrict(courts) {
  /** @type {Map<string, CourtRow[]>} */
  const groups = new Map();
  for (const c of [...courts].sort((a, b) => a.name.localeCompare(b.name))) {
    const key = c.district ?? NO_DISTRICT;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === NO_DISTRICT ? 1 : b === NO_DISTRICT ? -1 : a.localeCompare(b),
  );
}

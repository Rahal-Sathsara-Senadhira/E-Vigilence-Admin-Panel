// Which station gets a case — docs/03 §5.1:
//   1. an active, verified station whose drawn area contains the place
//      (several: the smallest area wins, and the case is flagged);
//   2. otherwise the nearest active, verified station.
// The choice is made before the transaction that records it (geo queries
// and transactions don't mix), from the ~350 stations in memory.

import { areaContains, areaSizeKm2, distanceKm } from "#src/core/geo.js";
import { Station } from "../organisation/organisation.model.js";
import { caseOfficersAt } from "../users/index.js";

/**
 * @typedef {object} DispatchPlan
 * @property {any} stationId
 * @property {string} stationName
 * @property {"jurisdiction" | "nearest" | "manual" | "station_recorded"} method
 * @property {number | null} distanceKm
 * @property {string[]} warnings
 */

/**
 * The automatic choice, or null when there is none (no place, or no
 * station to choose) — the case then waits for HQ (C8).
 * @param {{ location?: { coordinates: number[] } | null }} facts
 * @param {{ exclude?: any[] }} [options] stations not to choose (they returned it)
 * @returns {Promise<DispatchPlan | null>}
 */
export async function autoPlan(facts, { exclude = [] } = {}) {
  const [lng, lat] = facts.location?.coordinates ?? [];
  if (lat === undefined || lng === undefined) return null;
  const excluded = new Set(exclude.map(String));
  const stations = (
    await Station.find({ isActive: true, verified: true }, { name: 1, location: 1, area: 1 }).lean()
  ).filter((s) => !excluded.has(String(s._id)));

  const containing = stations
    .filter((s) => s.area && areaContains(s.area, lat, lng))
    .map((s) => ({ s, size: areaSizeKm2(/** @type {any} */ (s.area)) }))
    .sort((a, b) => a.size - b.size);
  /** @type {any} */
  let chosen = containing[0]?.s ?? null;
  const warnings = containing.length > 1 ? ["overlapping_areas"] : [];
  let method = /** @type {DispatchPlan["method"]} */ ("jurisdiction");
  if (!chosen) {
    method = "nearest";
    let best = Infinity;
    for (const s of stations) {
      const [slng, slat] = s.location?.coordinates ?? [];
      if (slat === undefined || slng === undefined) continue;
      const d = distanceKm({ lat, lng }, { lat: slat, lng: slng });
      if (d < best) {
        best = d;
        chosen = s;
      }
    }
  }
  if (!chosen) return null;
  return finish(chosen, method, { lat, lng }, warnings);
}

/**
 * HQ's own choice (docs/03 §5.2). The station must be active; unverified
 * stations are allowed with a warning.
 * @param {any} stationId @param {{ location?: { coordinates: number[] } | null }} facts
 * @returns {Promise<DispatchPlan | null>} null if the station can't take cases
 */
export async function manualPlan(stationId, facts) {
  const s = await Station.findOne(
    { _id: stationId, isActive: true },
    { name: 1, location: 1, verified: 1 },
  ).lean();
  if (!s) return null;
  const [lng, lat] = facts.location?.coordinates ?? [];
  const warnings = s.verified ? [] : ["unverified_station"];
  return finish(
    s,
    "manual",
    lat !== undefined && lng !== undefined ? { lat, lng } : null,
    warnings,
  );
}

/**
 * @param {any} s @param {DispatchPlan["method"]} method
 * @param {{ lat: number, lng: number } | null} place @param {string[]} warnings
 * @returns {Promise<DispatchPlan>}
 */
async function finish(s, method, place, warnings) {
  const [slng, slat] = s.location?.coordinates ?? [];
  const distance =
    place && slat !== undefined && slng !== undefined
      ? Math.round(distanceKm(place, { lat: slat, lng: slng }) * 10) / 10
      : null;
  const officers = await caseOfficersAt(s._id);
  return {
    stationId: s._id,
    stationName: s.name,
    method,
    distanceKm: distance,
    warnings: [...warnings, ...(officers.length ? [] : ["no_active_officers"])],
  };
}

// Which stations a user can see and change — docs/20 §5.4.
//   stations.view        N/R everywhere · D own division · S own station
//   stations.editContact D own division · S own station (contact details only)
//   stations.manage      N — everything, including verification and areas

import { scopeOf } from "#src/core/access/permissions.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */

const same = (/** @type {any} */ a, /** @type {any} */ b) =>
  a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

/**
 * A Mongo filter for the stations a permission reaches, or null for none.
 * @param {Actor} actor
 * @param {"stations.view" | "stations.editContact" | "stations.manage"} permission
 */
export function stationFilter(actor, permission) {
  const scope = scopeOf(actor.role, permission);
  if (scope === "N" || scope === "R") return {};
  if (scope === "D") return { divisionId: actor.divisionId };
  if (scope === "S") return { _id: actor.stationId };
  return null;
}

/**
 * @param {Actor} actor
 * @param {"stations.view" | "stations.editContact" | "stations.manage"} permission
 * @param {{ _id: any, divisionId?: any }} station
 */
export function reaches(actor, permission, station) {
  const scope = scopeOf(actor.role, permission);
  if (scope === "N" || scope === "R") return true;
  if (scope === "D") return same(station.divisionId, actor.divisionId);
  if (scope === "S") return same(station._id, actor.stationId);
  return false;
}

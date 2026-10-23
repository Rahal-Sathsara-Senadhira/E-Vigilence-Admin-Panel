// Who may see and manage which accounts — docs/20 §2, §6, S5.
//
// Seeing follows the scope of `users.view`: national roles see everyone, a
// division supervisor the staff of their division, an OIC their station.
// Managing needs `users.manage`, a role the actor may manage (§6), the same
// scope, and never one's own account (S5).

import { canManageRole, roleInfo } from "#src/core/access/roles.js";
import { scopeOf } from "#src/core/access/permissions.js";

/** @typedef {import("#src/core/access/roles.js").Role} Role */
/**
 * @typedef {object} Actor
 * @property {any} userId
 * @property {Role} role
 * @property {any} stationId
 * @property {any} divisionId
 */
/**
 * @typedef {object} Target
 * @property {any} _id
 * @property {string} role
 * @property {any} [stationId]
 * @property {any} [divisionId]
 */

const same = (/** @type {any} */ a, /** @type {any} */ b) =>
  a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

/**
 * Whether the account sits inside a scope.
 * @param {"N" | "D" | "S" | "A" | "R" | null} scope
 * @param {Actor} actor
 * @param {Target} target
 * @param {any} targetStationDivisionId  the division of the target's station, if any
 */
function inScope(scope, actor, target, targetStationDivisionId) {
  if (scope === "N" || scope === "R") return true;
  if (scope === "D") {
    return (
      same(target.divisionId, actor.divisionId) || same(targetStationDivisionId, actor.divisionId)
    );
  }
  if (scope === "S") return same(target.stationId, actor.stationId);
  return false;
}

/** @param {Actor} actor @param {Target} target @param {any} [stationDivisionId] */
export const canSee = (actor, target, stationDivisionId = null) =>
  inScope(scopeOf(actor.role, "users.view"), actor, target, stationDivisionId);

/**
 * Whether the actor may change this account, and if not, why.
 * @param {Actor} actor @param {Target} target @param {any} [stationDivisionId]
 * @returns {string | null} a reason it isn't allowed, or null
 */
export function whyCannotManage(actor, target, stationDivisionId = null) {
  if (same(actor.userId, target._id))
    return "You can't change your own account. Ask your account manager.";
  const scope = scopeOf(actor.role, "users.manage");
  if (!scope || roleInfo(actor.role).readOnly) return "Your role can't manage accounts.";
  if (!canManageRole(actor.role, /** @type {Role} */ (target.role))) {
    return `Your role can't manage ${roleInfo(/** @type {Role} */ (target.role)).label.toLowerCase()} accounts.`;
  }
  if (!inScope(scope, actor, target, stationDivisionId))
    return "This account is outside your area.";
  return null;
}

/**
 * Checks a role and place the actor wants to give an account (create or edit).
 * @param {Actor} actor
 * @param {{ role: Role, stationId?: string, divisionId?: string }} wanted
 * @returns {Record<string, string> | null} field errors, or null when allowed
 */
export function placementProblems(actor, wanted) {
  if (!canManageRole(actor.role, wanted.role)) {
    return { role: "Your role can't give this role to an account." };
  }
  const level = roleInfo(wanted.role).level;
  if (level === "station" && !wanted.stationId) return { stationId: "Choose the station." };
  if (level === "division" && !wanted.divisionId) return { divisionId: "Choose the division." };
  // An OIC places staff only at their own station.
  if (scopeOf(actor.role, "users.manage") === "S" && !same(wanted.stationId, actor.stationId)) {
    return { stationId: "You can add staff to your own station only." };
  }
  return null;
}

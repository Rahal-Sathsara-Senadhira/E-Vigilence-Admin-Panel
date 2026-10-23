// The shape of an account in responses. Never includes the password hash,
// two-step secrets or recovery codes.

import { roleInfo } from "#src/core/access/roles.js";

/** @typedef {import("#src/core/access/roles.js").Role} Role */

/**
 * @param {any} user a lean or hydrated account
 * @param {{ stations: Map<string, { name: string, divisionId: any }>, divisions: Map<string, { name: string }> }} places
 * @param {{ manageable: boolean }} access
 */
export function accountView(user, places, { manageable }) {
  const info = roleInfo(/** @type {Role} */ (user.role));
  const station = user.stationId ? places.stations.get(String(user.stationId)) : null;
  const divisionId = user.divisionId ?? station?.divisionId ?? null;
  const division = divisionId ? places.divisions.get(String(divisionId)) : null;
  const locked = Boolean(user.lockedUntil && new Date(user.lockedUntil) > new Date());
  const status = !user.isActive ? "inactive" : locked ? "locked" : "active";
  return {
    id: String(user._id),
    name: user.name,
    email: user.email ?? null,
    serviceNumber: user.serviceNumber ?? null,
    phone: user.phone ?? null,
    role: user.role,
    roleLabel: info.label,
    level: info.level,
    station: station ? { id: String(user.stationId), name: station.name } : null,
    division: division ? { id: String(divisionId), name: division.name } : null,
    status,
    lockedUntil: locked ? new Date(user.lockedUntil).toISOString() : null,
    mustChangePassword: Boolean(user.mustChangePassword),
    mfa: { enabled: Boolean(user.mfa?.enabled), required: info.mfaRequired },
    lastSignInAt: user.lastSignInAt ? new Date(user.lastSignInAt).toISOString() : null,
    createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
    can: {
      edit: manageable,
      resetPassword: manageable && user.isActive,
      resetMfa: manageable && user.isActive && Boolean(user.mfa?.enabled),
      unlock: manageable && locked,
      deactivate: manageable && user.isActive,
      reactivate: manageable && !user.isActive,
    },
  };
}

/** @typedef {ReturnType<typeof accountView>} AccountView */

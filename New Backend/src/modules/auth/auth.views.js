// What the panel receives about the signed-in user (docs/19 D19-5): who they
// are, their role, and every permission with its scope, so menus can be
// built without repeating the rules.

import { grantsFor } from "#src/core/access/permissions.js";
import { roleInfo } from "#src/core/access/roles.js";

/**
 * @param {import("../users/user.model.js").UserDocument} user
 * @param {{ station: { _id: any, name: string } | null, division: { _id: any, name: string } | null }} place
 */
export function currentUserView(user, { station, division }) {
  const role = /** @type {import("#src/core/access/roles.js").Role} */ (user.role);
  const info = roleInfo(role);
  return {
    id: String(user._id),
    name: user.name,
    email: user.email ?? null,
    serviceNumber: user.serviceNumber ?? null,
    role,
    roleLabel: info.label,
    level: info.level,
    readOnly: info.readOnly,
    station: station ? { id: String(station._id), name: station.name } : null,
    division: division ? { id: String(division._id), name: division.name } : null,
    mfa: { enabled: Boolean(user.mfa?.enabled), required: info.mfaRequired },
    idleMinutes: info.idleMinutes,
    permissions: grantsFor(role),
  };
}

/** @typedef {ReturnType<typeof currentUserView>} CurrentUserView */

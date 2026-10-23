// The 11 roles — docs/20 §3. The only place that says what a role is.

/** @typedef {"national" | "division" | "station"} Level */

/**
 * @typedef {object} RoleDefinition
 * @property {string} label       shown in the panel
 * @property {Level} level        which records the role can reach (§2)
 * @property {boolean} mfaRequired two-step sign-in required (D20-2)
 * @property {boolean} readOnly   can never change anything (S6)
 * @property {number} idleMinutes signed out after this long without activity (§9)
 */

/** @type {Record<string, RoleDefinition>} */
const DEFINITIONS = {
  system_admin: {
    label: "System administrator",
    level: "national",
    mfaRequired: true,
    readOnly: false,
    idleMinutes: 15,
  },
  hq_admin: {
    label: "HQ administrator",
    level: "national",
    mfaRequired: true,
    readOnly: false,
    idleMinutes: 15,
  },
  hq_operator: {
    label: "HQ operator",
    level: "national",
    mfaRequired: true,
    readOnly: false,
    idleMinutes: 15,
  },
  hq_supervisor: {
    label: "HQ supervisor",
    level: "national",
    mfaRequired: true,
    readOnly: false,
    idleMinutes: 15,
  },
  finance_officer: {
    label: "Finance officer",
    level: "national",
    mfaRequired: true,
    readOnly: false,
    idleMinutes: 15,
  },
  auditor: {
    label: "Auditor",
    level: "national",
    mfaRequired: true,
    readOnly: true,
    idleMinutes: 15,
  },
  executive: {
    label: "Executive viewer",
    level: "national",
    mfaRequired: true,
    readOnly: true,
    idleMinutes: 15,
  },
  division_supervisor: {
    label: "Division supervisor",
    level: "division",
    mfaRequired: true,
    readOnly: false,
    idleMinutes: 30,
  },
  station_oic: {
    label: "Station OIC",
    level: "station",
    mfaRequired: false,
    readOnly: false,
    idleMinutes: 30,
  },
  traffic_officer: {
    label: "Traffic officer",
    level: "station",
    mfaRequired: false,
    readOnly: false,
    idleMinutes: 30,
  },
  station_clerk: {
    label: "Station clerk",
    level: "station",
    mfaRequired: false,
    readOnly: false,
    idleMinutes: 30,
  },
};

/** @typedef {keyof typeof DEFINITIONS} Role */

export const ROLES = /** @type {Role[]} */ (Object.keys(DEFINITIONS));

/** @param {unknown} value @returns {value is Role} */
export const isRole = (value) => typeof value === "string" && value in DEFINITIONS;

/** @param {Role} role */
export const roleInfo = (role) => DEFINITIONS[role];

/** Signed out after this long regardless of activity (§9). */
export const SESSION_MAX_HOURS = 12;

/**
 * Who may create and manage accounts of which role — docs/20 §6.
 * @type {Partial<Record<Role, Role[]>>}
 */
const MANAGES = {
  system_admin: ["system_admin", "hq_admin"],
  hq_admin: ROLES.filter((r) => r !== "system_admin" && r !== "hq_admin"),
  station_oic: ["traffic_officer", "station_clerk"],
};

/** @param {Role} actor @param {Role} target */
export const canManageRole = (actor, target) => (MANAGES[actor] ?? []).includes(target);

/** @param {Role} actor */
export const managedRoles = (actor) => MANAGES[actor] ?? [];

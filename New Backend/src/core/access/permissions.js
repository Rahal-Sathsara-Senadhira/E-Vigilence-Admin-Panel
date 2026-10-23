// The permission matrix — docs/20 §5, column for column.
//
// Scope letters: N nationally · D own division · S own station · A assigned
// to the user · R read-only at the role's level. A missing role has no access.
// Record-level rules (separation of duties, "own station's officers only")
// are checked by each module's policy on top of these grants.

/** @typedef {import("./roles.js").Role} Role */
/** @typedef {"N" | "D" | "S" | "A" | "R"} Scope */

const SA = "system_admin";
const HA = "hq_admin";
const HO = "hq_operator";
const HS = "hq_supervisor";
const FO = "finance_officer";
const AU = "auditor";
const EX = "executive";
const DS = "division_supervisor";
const OIC = "station_oic";
const TO = "traffic_officer";
const SC = "station_clerk";

/** @type {Record<string, Partial<Record<Role, Scope>>>} */
export const MATRIX = {
  // 5.1 Reports and evidence
  "reports.view": { [HO]: "N", [HS]: "N", [AU]: "R", [DS]: "D", [OIC]: "S", [TO]: "S", [SC]: "S" },
  "reports.record": { [HO]: "N", [HS]: "N", [OIC]: "S", [TO]: "S", [SC]: "S" },
  "reports.triage": { [HO]: "N", [HS]: "N" },
  "evidence.viewOriginal": { [HO]: "N", [HS]: "N", [AU]: "R", [DS]: "D", [OIC]: "S", [TO]: "A" },

  // 5.2 Cases and people
  "cases.view": { [HO]: "N", [HS]: "N", [AU]: "R", [DS]: "D", [OIC]: "S", [TO]: "S", [SC]: "S" },
  "cases.dispatch": { [HO]: "N", [HS]: "N", [DS]: "D" },
  "cases.acceptReturn": { [OIC]: "S", [TO]: "S" },
  "cases.assignOfficer": { [HS]: "N", [DS]: "D", [OIC]: "S" },
  "cases.investigate": { [OIC]: "S", [TO]: "A" },
  "cases.recommend": { [OIC]: "S", [TO]: "A" },
  "cases.decide": { [HS]: "N", [DS]: "D", [OIC]: "S" },
  "cases.override": { [HS]: "N" },
  "persons.view": { [HS]: "N", [AU]: "R", [DS]: "D", [OIC]: "S", [TO]: "A", [SC]: "S" },
  "persons.merge": { [HA]: "N" },

  // 5.3 Notices, court and payments
  "notices.view": {
    [HO]: "N",
    [HS]: "N",
    [FO]: "N",
    [AU]: "R",
    [DS]: "D",
    [OIC]: "S",
    [TO]: "S",
    [SC]: "S",
  },
  "notices.serve": { [OIC]: "S", [TO]: "S", [SC]: "S" },
  "notices.recordResponse": { [OIC]: "S", [TO]: "S", [SC]: "S" },
  "notices.reviewNomination": { [HS]: "N", [DS]: "D", [OIC]: "S", [TO]: "S" },
  "notices.reviewDispute": { [HS]: "N", [DS]: "D", [OIC]: "S" },
  "notices.withdraw": { [HS]: "N" },
  "court.view": { [HS]: "N", [AU]: "R", [DS]: "D", [OIC]: "S", [TO]: "S", [SC]: "S" },
  "court.record": { [OIC]: "S", [TO]: "A", [SC]: "S" },
  "court.confirmReferral": { [HS]: "N", [DS]: "D", [OIC]: "S" },
  "payments.view": { [HS]: "N", [FO]: "N", [AU]: "R", [DS]: "D", [OIC]: "S", [SC]: "S" },
  "payments.recordReceipt": { [FO]: "N", [OIC]: "S", [SC]: "S" },
  "payments.reviewReceipt": { [FO]: "N" },
  "payments.approveRefund": { [FO]: "N" },
  "payments.reconcile": { [FO]: "N", [AU]: "R" },

  // 5.4 Rewards, reference data and accounts
  "rewards.view": { [HA]: "N", [HS]: "N", [FO]: "N", [AU]: "R" },
  "rewards.manageRules": { [HA]: "N" },
  "rewards.approvePayouts": { [FO]: "N" },
  "offences.view": {
    [HA]: "N",
    [HO]: "N",
    [HS]: "N",
    [FO]: "N",
    [AU]: "R",
    [EX]: "R",
    [DS]: "D",
    [OIC]: "S",
    [TO]: "S",
    [SC]: "S",
  },
  "offences.manage": { [HA]: "N" },
  "stations.view": {
    [HA]: "N",
    [HO]: "N",
    [HS]: "N",
    [AU]: "R",
    [EX]: "R",
    [DS]: "D",
    [OIC]: "S",
    [TO]: "S",
    [SC]: "S",
  },
  "stations.editContact": { [DS]: "D", [OIC]: "S" },
  "stations.manage": { [HA]: "N" },
  "users.view": { [SA]: "N", [HA]: "N", [AU]: "R", [DS]: "D", [OIC]: "S" },
  "users.manage": { [SA]: "N", [HA]: "N", [OIC]: "S" },
  "settings.timeLimits": { [HA]: "N" },
  "settings.system": { [SA]: "N" },
  "audit.view": { [HA]: "N", [HS]: "N", [AU]: "R", [DS]: "D", [OIC]: "S" },
  "system.health": { [SA]: "N" },

  // 5.5 Dashboards and reports
  "dashboard.national": { [HA]: "N", [HO]: "N", [HS]: "N", [FO]: "N", [AU]: "R", [EX]: "R" },
  "dashboard.division": { [DS]: "D" },
  "dashboard.station": { [OIC]: "S" },
  "dashboard.mine": { [TO]: "A", [SC]: "S" },
  "managementReports.view": {
    [HA]: "N",
    [HS]: "N",
    [FO]: "N",
    [AU]: "R",
    [EX]: "R",
    [DS]: "D",
    [OIC]: "S",
  },
};

/** @typedef {keyof typeof MATRIX} Permission */

export const PERMISSIONS = /** @type {Permission[]} */ (Object.keys(MATRIX));

/** @param {unknown} value @returns {value is Permission} */
export const isPermission = (value) => typeof value === "string" && value in MATRIX;

/**
 * The scope a role has for a permission, or null for no access.
 * @param {Role} role @param {Permission} permission @returns {Scope | null}
 */
export const scopeOf = (role, permission) => MATRIX[permission]?.[role] ?? null;

/**
 * Every permission a role holds, with its scope — sent to the panel at
 * sign-in so it can build menus (docs/19 D19-5).
 * @param {Role} role @returns {Partial<Record<Permission, Scope>>}
 */
export function grantsFor(role) {
  /** @type {Partial<Record<Permission, Scope>>} */
  const grants = {};
  for (const permission of PERMISSIONS) {
    const scope = scopeOf(role, permission);
    if (scope) grants[permission] = scope;
  }
  return grants;
}

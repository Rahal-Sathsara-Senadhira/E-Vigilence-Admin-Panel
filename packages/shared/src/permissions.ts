// The permission matrix — docs/01-roles-and-permissions.md §6.
//
// This is the only place that says who can do what. The API's permission
// guard and the web app's navigation both read it, so they can't disagree.
//
// A grant has a scope:
//   all      — nationally
//   station  — records of the user's own station
//   assigned — records assigned to the user (investigating officer)
//
// Rules that depend on the record itself (separation of duties S1/S2, "not
// a dev account", "own station's officers only") are checked by the service
// that owns the record, on top of the grant.

import type { Role } from "./roles.js";

export const PERMISSIONS = [
  // Reports and triage (02)
  "reports.view",
  "reports.record",
  "reports.triage",
  "evidence.viewOriginal",
  // Cases and dispatch (03)
  "cases.view",
  "cases.dispatch",
  "cases.acceptReturn",
  "cases.assignOfficer",
  "cases.investigate",
  "cases.recommend",
  "cases.decide",
  "cases.override",
  // Outcomes (05–07)
  "notices.view",
  "notices.serve",
  "notices.reviewDispute",
  "notices.withdraw",
  "payments.recordReceipt",
  "court.record",
  // People (04)
  "persons.view",
  // Reference data
  "offences.view",
  "offences.manage",
  "stations.view",
  "stations.editContact",
  "stations.manage",
  // Accounts
  "users.view",
  "users.manage",
  // Rewards (16)
  "rewards.viewRules",
  "rewards.manageRules",
  "rewards.approvePayouts",
  // System
  "settings.manage",
  "settings.timeLimits",
  "audit.view",
  "system.health",
  // Dashboards (12)
  "dashboard.commandCenter",
  "dashboard.myStation",
  "dashboard.myWork",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type Scope = "all" | "station" | "assigned";
export type Grants = Partial<Record<Permission, Scope>>;

const OFFICER: Grants = {
  // Their station's reports: walk-in, phone and officer-observed (docs/02 §7).
  "reports.view": "station",
  "reports.record": "station",
  "cases.view": "station",
  "cases.acceptReturn": "station",
  "cases.investigate": "assigned",
  "cases.recommend": "assigned",
  "persons.view": "assigned",
  "offences.view": "all",
  "stations.view": "station",
  "dashboard.myWork": "station",
  // Their station's notices: post them, record returned mail, record and check nominations (05 §5–6).
  "notices.view": "station",
  "notices.serve": "station",
};

const OIC: Grants = {
  ...OFFICER,
  "cases.assignOfficer": "station",
  "cases.investigate": "station",
  "cases.recommend": "station",
  "cases.decide": "station",
  "notices.reviewDispute": "station",
  "payments.recordReceipt": "station",
  "court.record": "station",
  "persons.view": "station",
  "stations.editContact": "station",
  "users.view": "station",
  "users.manage": "station",
  "audit.view": "station",
  "dashboard.myStation": "station",
};

const HQ: Grants = {
  "reports.view": "all",
  "reports.record": "all", // WhatsApp and phone reports (docs/02 §3)
  "reports.triage": "all",
  // Untouched originals: HQ, with a reason (D10-1). The prosecuting officer gets access through the court bundle (phase 4).
  "evidence.viewOriginal": "all",
  "cases.view": "all",
  "cases.dispatch": "all",
  "cases.assignOfficer": "all",
  "cases.investigate": "all",
  "cases.decide": "all",
  "cases.override": "all",
  "notices.view": "all",
  "notices.serve": "all",
  "notices.reviewDispute": "all",
  "notices.withdraw": "all",
  "payments.recordReceipt": "all",
  "court.record": "all",
  "persons.view": "all",
  "offences.view": "all",
  "offences.manage": "all",
  "stations.view": "all",
  "stations.editContact": "all",
  "stations.manage": "all",
  "users.view": "all",
  "users.manage": "all",
  "rewards.viewRules": "all",
  "rewards.manageRules": "all",
  "rewards.approvePayouts": "all",
  "settings.manage": "all",
  "settings.timeLimits": "all", // HQ only — D09-8
  "audit.view": "all",
  "dashboard.commandCenter": "all",
};

// Dev: technical administration only (§4.5, D01-4). Read access to
// operational screens is for support, and every such view is logged
// (see SUPPORT_VIEW_ROLES). No triage, dispatch, decisions, money or court.
const DEV: Grants = {
  "reports.view": "all",
  "cases.view": "all",
  "offences.view": "all",
  "stations.view": "all",
  "users.view": "all",
  "users.manage": "all",
  "rewards.viewRules": "all",
  "settings.manage": "all",
  "audit.view": "all",
  "system.health": "all",
  "dashboard.commandCenter": "all",
};

export const PERMISSION_MATRIX: Record<Role, Grants> = {
  station_officer: OFFICER,
  station_oic: OIC,
  hq: HQ,
  dev: DEV,
  division_admin: {}, // reserved (D01-6)
};

/** Roles whose read access to operational data is support access and is logged. */
export const SUPPORT_VIEW_ROLES: readonly Role[] = ["dev"];

/** The scope a role has for a permission, or null when it has none. */
export function scopeOf(role: Role, permission: Permission): Scope | null {
  return PERMISSION_MATRIX[role]?.[permission] ?? null;
}

export function can(role: Role, permission: Permission): boolean {
  return scopeOf(role, permission) !== null;
}

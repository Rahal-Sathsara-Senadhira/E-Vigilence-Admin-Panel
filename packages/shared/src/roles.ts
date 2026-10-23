// Roles — docs/01-roles-and-permissions.md §3.
//
// `division_admin` is reserved (D01-6): it exists in the type so the matrix
// can describe it, but no account can hold it until it is switched on.

export const STAFF_ROLES = ["hq", "station_oic", "station_officer", "dev"] as const;
export const RESERVED_ROLES = ["division_admin"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
export type ReservedRole = (typeof RESERVED_ROLES)[number];
export type Role = StaffRole | ReservedRole;

/** Roles that belong to exactly one station (R2). */
export const STATION_ROLES = [
  "station_oic",
  "station_officer",
] as const satisfies readonly StaffRole[];

/** Roles that must use an authenticator-app code to sign in (D17-3). */
export const MFA_REQUIRED_ROLES = ["hq", "dev"] as const satisfies readonly StaffRole[];

export const ROLE_LABELS: Record<Role, string> = {
  hq: "HQ Traffic Unit",
  division_admin: "Division supervisor",
  station_oic: "Station OIC",
  station_officer: "Traffic officer",
  dev: "Developer",
};

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

export function isStationRole(role: Role): boolean {
  return (STATION_ROLES as readonly string[]).includes(role);
}

export function requiresMfa(role: Role): boolean {
  return (MFA_REQUIRED_ROLES as readonly string[]).includes(role);
}

/**
 * Who may create or manage an account with `target` role (§7, D01-4, D01-5):
 * - dev manages every role, including dev;
 * - hq manages every role except dev (closes P3 — privilege escalation);
 * - an OIC manages traffic officers at their own station only.
 */
export function canManageRole(actor: Role, target: Role): boolean {
  switch (actor) {
    case "dev":
      return isStaffRole(target);
    case "hq":
      return isStaffRole(target) && target !== "dev";
    case "station_oic":
      return target === "station_officer";
    default:
      return false;
  }
}

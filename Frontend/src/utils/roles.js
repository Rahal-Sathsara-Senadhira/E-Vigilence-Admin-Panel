// src/utils/roles.js
//
// Single source of truth for role checks on the frontend.
// The system supports 3 roles:
// - "dev": Developer / Project Owner (Super Admin)
// - "hq": HQ Administrator (Whole System Admin)
// - "station_officer": Police Officer (Station Level)

export function isStationRole(role) {
  return role === "station_officer" || role === "station";
}

export function isAdminRole(role) {
  return role === "dev" || role === "hq" || role === "admin";
}

export function isDevRole(role) {
  return role === "dev";
}

const ROLE_LABELS = {
  dev: "Developer",
  hq: "HQ Admin",
  station_officer: "Police Officer",
};

// Real, assignable roles — for filter dropdowns and user forms.
export const ASSIGNABLE_ROLES = ["dev", "hq", "station_officer"];

export function formatRole(role) {
  return ROLE_LABELS[role] || role || "—";
}

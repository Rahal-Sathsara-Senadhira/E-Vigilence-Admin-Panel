// src/utils/roles.js
//
// Single source of truth for role checks on the frontend.
// The backend User schema (Backend/src/db/providers/mongo/models/User.js)
// only ever issues "hq" | "station_admin" | "station_officer" — "admin" is
// kept here too for backward compatibility with any pre-existing sessions.

export function isStationRole(role) {
  return role === "station" || role === "station_admin" || role === "station_officer";
}

export function isAdminRole(role) {
  return role === "hq" || role === "admin";
}

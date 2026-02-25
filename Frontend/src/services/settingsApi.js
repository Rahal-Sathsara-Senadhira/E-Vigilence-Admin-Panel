import { api } from "./api";

const BASE = "/api/settings";

// Fetch current settings for logged in user / system
export function getSettings() {
  return api.get(BASE);
}

// Update user profile (name, email, station, etc.)
export function updateProfile(payload) {
  return api.patch(`${BASE}/profile`, payload);
}

// Change password
export function changePassword(payload) {
  // payload: { current_password, new_password }
  return api.patch(`${BASE}/password`, payload);
}

// Update preferences (theme, language, notifications toggles)
export function updatePreferences(payload) {
  return api.patch(`${BASE}/preferences`, payload);
}

// System settings (admin only)
export function updateSystem(payload) {
  return api.patch(`${BASE}/system`, payload);
}
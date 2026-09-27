// src/utils/auth.js
//
// The session token itself lives in an httpOnly cookie set by the backend
// (see Backend/src/modules/auth/auth.controller.js) — it is never readable
// from JS, so it never touches localStorage. What's stored here is only the
// non-sensitive user profile, for synchronous UI decisions (route guards,
// "who's logged in" display). The cookie is what every API call actually
// authenticates with (fetch calls use `credentials: "include"`); if it's
// missing/expired the server returns 401 and services/api.js clears this
// local copy and bounces to /login.

const KEY = "evigilance_auth";

export function getAuth() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAuth({ user }) {
  localStorage.setItem(KEY, JSON.stringify({ user }));
}

export function clearAuth() {
  localStorage.removeItem(KEY);
}

export function getUser() {
  return getAuth()?.user || null;
}

export function isLoggedIn() {
  return !!getUser();
}

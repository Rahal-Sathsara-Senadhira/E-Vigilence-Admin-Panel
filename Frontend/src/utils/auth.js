// src/utils/auth.js

const KEY = "evigilance_auth";

// Decode a JWT's payload without pulling in a dependency. Returns null on
// anything malformed rather than throwing.
function decodeJwtPayload(token) {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isExpired(token) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false; // no exp claim -> don't force-expire
  return Date.now() >= payload.exp * 1000;
}

export function getAuth() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (parsed?.token && isExpired(parsed.token)) {
      localStorage.removeItem(KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function setAuth(payload) {
  // payload: { token, user: { name, email, role } }
  localStorage.setItem(KEY, JSON.stringify(payload));
}

export function clearAuth() {
  localStorage.removeItem(KEY);
}

export function getToken() {
  return getAuth()?.token || null;
}

export function getUser() {
  return getAuth()?.user || null;
}

export function isLoggedIn() {
  return !!getAuth()?.token;
}

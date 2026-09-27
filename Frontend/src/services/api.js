// src/services/api.js
import { clearAuth } from "../utils/auth";
import { showToast } from "../utils/toastBus";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8081";

// A 401 outside of a login attempt means the session cookie is missing or
// expired — the local "logged in" flag is stale, so clear it and send the
// user back to log in again.
function handleUnauthorized(path) {
  if (path === "/api/auth/login") return;
  clearAuth();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;

  const res = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await res.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    if (res.status === 401) handleUnauthorized(path);

    const msg =
      json?.error ||
      json?.message ||
      `Request failed (${res.status} ${res.statusText})`;

    // Callers that expect a failure to sometimes be a normal state (e.g.
    // "no dispatch yet" for a violation that hasn't been sent anywhere) pass
    // { silent: true } so a routine 404 doesn't surface as a user-facing
    // error toast — the caller still gets the thrown error to handle.
    if (!options.silent) showToast(msg, "error");

    const err = new Error(msg);
    err.status = res.status;
    err.body = json;
    throw err;
  }

  return json;
}

export const api = {
  get: (path, opts = {}) => request(path, { method: "GET", ...opts }),
  post: (path, body, opts = {}) =>
    request(path, { method: "POST", body: JSON.stringify(body), ...opts }),
  patch: (path, body, opts = {}) =>
    request(path, { method: "PATCH", body: JSON.stringify(body), ...opts }),
  del: (path, opts = {}) => request(path, { method: "DELETE", ...opts }),
};

// Authenticated file download (e.g. CSV export) — window.open()/plain <a href>
// don't reliably send cookies cross-context for a download, so this fetches
// as a blob (cookie included) and triggers the download client-side instead.
export async function downloadFile(path, filename) {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
  });

  if (!res.ok) {
    if (res.status === 401) handleUnauthorized(path);
    const msg = `Download failed (${res.status} ${res.statusText})`;
    showToast(msg, "error");
    throw new Error(msg);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
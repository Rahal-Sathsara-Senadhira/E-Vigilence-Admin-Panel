// The one way the panel talks to the backend (docs/19 §5).
//
// - The access token lives only in memory, never in browser storage.
// - The refresh token is an httpOnly cookie the page can't read.
// - Every request carries the security header the backend requires.
// - When the access token has expired, one shared refresh runs and the
//   request is retried once.

const BASE = "/api/v1";
const SECURITY_HEADER = { "X-Requested-With": "e-vigilance" };

export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {Record<string, string>} [fields]
   */
  constructor(status, code, message, fields = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/** @type {string | null} */
let accessToken = null;
/** @type {(session: SessionPayload | null) => void} */
let onSession = () => {};

/**
 * @typedef {object} SessionPayload
 * @property {string} accessToken
 * @property {string} accessTokenExpiresAt
 * @property {string} sessionExpiresAt
 * @property {CurrentUser} user
 */

/**
 * @typedef {object} CurrentUser
 * @property {string} id
 * @property {string} name
 * @property {string | null} email
 * @property {string | null} serviceNumber
 * @property {string} role
 * @property {string} roleLabel
 * @property {"national" | "division" | "station"} level
 * @property {boolean} readOnly
 * @property {{ id: string, name: string } | null} station
 * @property {{ id: string, name: string } | null} division
 * @property {{ enabled: boolean, required: boolean }} mfa
 * @property {number} idleMinutes
 * @property {Record<string, "N" | "D" | "S" | "A" | "R">} permissions
 */

/** Called by the session provider; every new session or sign-out goes through here. */
export function setSessionListener(/** @type {typeof onSession} */ listener) {
  onSession = listener;
}

/** @param {SessionPayload | null} session */
export function applySession(session) {
  accessToken = session?.accessToken ?? null;
  onSession(session);
}

/** @param {Response} res */
async function parse(res) {
  if (res.status === 204) return null;
  const text = await res.text();
  /** @type {any} */
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = body?.error ?? {};
    throw new ApiError(
      res.status,
      err.code ?? "error",
      err.message ?? "Something went wrong. Please try again.",
      err.fields ?? {},
    );
  }
  return body;
}

/** Why the last session ended (e.g. idle), to show on the sign-in page. */
let endedReason = /** @type {string | null} */ (null);
export const takeEndedReason = () => {
  const reason = endedReason;
  endedReason = null;
  return reason;
};
/** @param {string | null} reason */
export const setEndedReason = (reason) => {
  endedReason = reason;
};

/**
 * Whether a request may refresh an expired token silently. The session
 * layer says no once the user has been idle, so background requests can't
 * keep an unattended session alive.
 */
let mayRefresh = () => true;
/** @param {() => boolean} guard */
export function setRefreshGuard(guard) {
  mayRefresh = guard;
}

/** @type {Promise<SessionPayload | null> | null} */
let refreshing = null;

/**
 * Swaps the refresh cookie for a new session. Null when the session has
 * ended. Concurrent callers share one request.
 * @returns {Promise<SessionPayload | null>}
 */
export function refreshSession() {
  refreshing ??= (async () => {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`${BASE}/auth/refresh`, {
          method: "POST",
          credentials: "same-origin",
          headers: SECURITY_HEADER,
        });
        if (res.status === 409) {
          // Another tab refreshed at the same moment; its new cookie is ours too.
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          // Explain why only when this tab had a session (idle, 12 hours…),
          // not on a first visit with no session at all.
          if (accessToken) endedReason = body?.error?.message ?? null;
          applySession(null);
          return null;
        }
        const { session } = await res.json();
        applySession(session);
        return session;
      }
      applySession(null);
      return null;
    } catch {
      // Network down: keep the current state; the next request will retry.
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/**
 * @template T
 * @param {string} path  e.g. "/auth/me"
 * @param {{ method?: string, body?: unknown, query?: Record<string, unknown>, signal?: AbortSignal }} [options]
 * @returns {Promise<T>}
 */
export async function api(path, { method = "GET", body, query, signal } = {}) {
  const url = new URL(BASE + path, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "")
      url.searchParams.set(key, String(value));
  }

  const send = () =>
    fetch(url, {
      method,
      signal,
      credentials: "same-origin",
      headers: {
        ...SECURITY_HEADER,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res;
  try {
    res = await send();
  } catch (err) {
    if (/** @type {any} */ (err)?.name === "AbortError") throw err;
    throw new ApiError(
      0,
      "network",
      "Can't reach the server. Check your connection and try again.",
    );
  }
  if (res.status === 401 && accessToken) {
    const code = (
      await res
        .clone()
        .json()
        .catch(() => null)
    )?.error?.code;
    if (code === "token_invalid" && mayRefresh() && (await refreshSession())) res = await send();
  }
  return parse(res);
}

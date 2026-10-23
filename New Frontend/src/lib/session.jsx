// The signed-in session — docs/20 §9 (shift-based sessions).
//
// - On start-up, the refresh cookie is swapped for a session (if there is one).
// - Activity (keys, clicks, touches, scrolling) is tracked and shared between
//   tabs. The access token is refreshed only while someone is working.
// - One minute before the role's idle limit (15 or 30 minutes) a warning
//   appears; at the limit the session ends and the sign-in page says why.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  applySession,
  refreshSession,
  setEndedReason,
  setRefreshGuard,
  setSessionListener,
} from "./api.js";
import { SessionContext } from "./session-context.js";

/** @typedef {import("./api.js").SessionPayload} SessionPayload */

/** @typedef {import("./session-context.js").SessionContextValue} SessionContextValue */

const ACTIVITY_KEY = "ev-last-activity";
const WARNING_MS = 60_000;
const TICK_MS = 1_000;
const ACTIVITY_EVENTS = /** @type {const} */ ([
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
]);

function readSharedActivity() {
  try {
    return Number(localStorage.getItem(ACTIVITY_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** @param {{ children: import("react").ReactNode }} props */
export function SessionProvider({ children }) {
  const [session, setSession] = useState(/** @type {SessionPayload | null} */ (null));
  const [status, setStatus] = useState(/** @type {SessionContextValue["status"]} */ ("loading"));
  const [idleSecondsLeft, setIdleSecondsLeft] = useState(/** @type {number | null} */ (null));
  // 0 until the first activity or sign-in; read only in effects and handlers.
  const lastActivity = useRef(0);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Every session change — sign-in, refresh, ended — arrives here.
  useEffect(() => {
    setSessionListener((next) => {
      // A session that just arrived (sign-in, or restored on load) counts as
      // activity. The server has already refused it if the user was idle.
      if (next && lastActivity.current === 0) lastActivity.current = Date.now();
      setSession(next);
      setStatus(next ? "signedIn" : "signedOut");
      if (!next) setIdleSecondsLeft(null);
    });
    void refreshSession().then((s) => {
      if (!s) setStatus("signedOut");
    });
  }, []);

  const markActive = useCallback(() => {
    const now = Date.now();
    // Throttle: one write every 5 seconds is plenty.
    if (now - lastActivity.current < 5_000) return;
    lastActivity.current = now;
    try {
      localStorage.setItem(ACTIVITY_KEY, String(now));
    } catch {
      /* storage blocked: this tab still tracks its own activity */
    }
  }, []);

  useEffect(() => {
    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, markActive, { passive: true });
    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, markActive);
    };
  }, [markActive]);

  const idleLimitMs = (session?.user.idleMinutes ?? 30) * 60_000;
  const idleFor = useCallback(
    () => Date.now() - Math.max(lastActivity.current, readSharedActivity()),
    [],
  );

  useEffect(() => {
    setRefreshGuard(() => idleFor() < idleLimitMs - WARNING_MS);
  }, [idleFor, idleLimitMs]);

  const signOut = useCallback(async (/** @type {string | undefined} */ reason) => {
    try {
      await api("/auth/sign-out", { method: "POST" });
    } catch {
      /* the session ends on this device either way */
    }
    setEndedReason(reason ?? null);
    applySession(null);
  }, []);

  // The clock: warning, idle sign-out, end of the 12-hour session, token refresh.
  useEffect(() => {
    if (status !== "signedIn") return;
    const timer = setInterval(() => {
      const current = sessionRef.current;
      if (!current) return;
      const now = Date.now();
      const idle = idleFor();

      if (idle >= idleLimitMs) {
        void signOut(
          `You were signed out after ${current.user.idleMinutes} minutes without activity.`,
        );
        return;
      }
      if (new Date(current.sessionExpiresAt).getTime() <= now) {
        void signOut("Your 12-hour session has ended. Please sign in again.");
        return;
      }
      setIdleSecondsLeft(
        idle >= idleLimitMs - WARNING_MS ? Math.ceil((idleLimitMs - idle) / 1000) : null,
      );
      const tokenLeft = new Date(current.accessTokenExpiresAt).getTime() - now;
      if (tokenLeft < 60_000 && idle < idleLimitMs - WARNING_MS) void refreshSession();
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [status, idleFor, idleLimitMs, signOut]);

  const stayActive = useCallback(() => {
    lastActivity.current = 0;
    markActive();
    setIdleSecondsLeft(null);
    void refreshSession();
  }, [markActive]);

  const start = useCallback(
    (/** @type {SessionPayload} */ payload) => {
      lastActivity.current = 0;
      markActive();
      applySession(payload);
    },
    [markActive],
  );

  const value = useMemo(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      start,
      signOut,
      idleSecondsLeft,
      stayActive,
    }),
    [status, session, start, signOut, idleSecondsLeft, stayActive],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

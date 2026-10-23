// The session context and the hooks screens use to read it. The provider
// that fills it is in session.jsx.

import { createContext, useContext } from "react";

/** @typedef {import("./api.js").CurrentUser} CurrentUser */
/** @typedef {import("./api.js").SessionPayload} SessionPayload */

/**
 * @typedef {object} SessionContextValue
 * @property {"loading" | "signedOut" | "signedIn"} status
 * @property {CurrentUser | null} user
 * @property {SessionPayload | null} session
 * @property {(payload: SessionPayload) => void} start  call when a sign-in completes
 * @property {(reason?: string) => Promise<void>} signOut
 * @property {number | null} idleSecondsLeft  set during the last minute before an idle sign-out
 * @property {() => void} stayActive
 */

export const SessionContext = createContext(/** @type {SessionContextValue | null} */ (null));

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>.");
  return value;
}

/** The signed-in user; only for screens behind the sign-in. */
export function useCurrentUser() {
  const { user } = useSession();
  if (!user) throw new Error("useCurrentUser needs a signed-in user.");
  return user;
}

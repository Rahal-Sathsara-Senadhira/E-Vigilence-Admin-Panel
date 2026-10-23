// HTTP in and out for signing in. The rules are in auth.service.js.

import { User } from "../users/user.model.js";

export const REFRESH_COOKIE = "ev_rt";
const COOKIE_PATH = "/api/v1/auth";
const TWELVE_HOURS_MS = 12 * 3_600_000;

/** @param {import("express").Request} req */
const contextOf = (req) => ({
  ip: req.ip ?? null,
  userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
});

/**
 * @param {import("./auth.service.js").AuthService} auth
 * @param {{ secureCookies: boolean }} options
 */
export function createAuthController(auth, { secureCookies }) {
  /** @param {import("express").Response} res @param {string} value */
  const setRefreshCookie = (res, value) =>
    res.cookie(REFRESH_COOKIE, value, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "strict",
      path: COOKIE_PATH,
      maxAge: TWELVE_HOURS_MS,
    });

  /** @param {import("express").Response} res */
  const clearRefreshCookie = (res) =>
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "strict",
      path: COOKIE_PATH,
    });

  /**
   * Sends a sign-in step result; on "signed_in" the refresh token goes in the
   * cookie only, never in the body.
   * @param {import("express").Response} res
   * @param {import("./auth.service.js").SignInResult} result
   * @param {object} [extra]
   */
  const sendResult = (res, result, extra = {}) => {
    if (result.status === "signed_in") {
      setRefreshCookie(res, result.refreshCookie);
      return res.json({ status: result.status, session: result.session, ...extra });
    }
    return res.json({ status: result.status, challenge: result.challenge, ...extra });
  };

  /** @type {Record<string, import("express").RequestHandler>} */
  return {
    signIn: async (req, res) => sendResult(res, await auth.signIn(req.body, contextOf(req))),
    verifyMfa: async (req, res) => sendResult(res, await auth.verifyMfa(req.body, contextOf(req))),
    setFirstPassword: async (req, res) =>
      sendResult(res, await auth.setFirstPassword(req.body, contextOf(req))),
    startMfaSetup: async (req, res) => {
      res.json(await auth.startMfaSetup(req.body));
    },
    confirmMfaSetup: async (req, res) => {
      const { recoveryCodes, result } = await auth.confirmMfaSetup(req.body, contextOf(req));
      sendResult(res, result, { recoveryCodes });
    },
    refresh: async (req, res) => {
      try {
        const { session, refreshCookie } = await auth.refresh(
          req.cookies?.[REFRESH_COOKIE],
          contextOf(req),
        );
        setRefreshCookie(res, refreshCookie);
        res.json({ session });
      } catch (err) {
        if (/** @type {any} */ (err)?.status === 401) clearRefreshCookie(res);
        throw err;
      }
    },
    signOut: async (req, res) => {
      const sessionId = req.auth
        ? String(req.auth.sessionId)
        : auth.sessionIdFromCookie(req.cookies?.[REFRESH_COOKIE]);
      const user = req.auth ? await User.findById(req.auth.userId) : null;
      if (sessionId) await auth.signOut(sessionId, user, contextOf(req));
      clearRefreshCookie(res);
      res.status(204).end();
    },
    me: async (req, res) => {
      res.json(await auth.me(/** @type {NonNullable<typeof req.auth>} */ (req.auth).userId));
    },
    changePassword: async (req, res) => {
      const { userId, sessionId } = /** @type {NonNullable<typeof req.auth>} */ (req.auth);
      await auth.changePassword(userId, sessionId, req.body, contextOf(req));
      res.status(204).end();
    },
    sessions: async (req, res) => {
      const { userId, sessionId } = /** @type {NonNullable<typeof req.auth>} */ (req.auth);
      res.json(await auth.listSessions(userId, sessionId));
    },
    signOutEverywhere: async (req, res) => {
      await auth.signOutEverywhere(
        /** @type {NonNullable<typeof req.auth>} */ (req.auth).userId,
        contextOf(req),
      );
      clearRefreshCookie(res);
      res.status(204).end();
    },
  };
}

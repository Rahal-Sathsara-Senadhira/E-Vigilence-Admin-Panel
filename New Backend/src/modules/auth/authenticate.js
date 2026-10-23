// Reads the access token on every request and sets `req.auth`. The session
// and account are checked each time, so signing out, "sign out everywhere"
// and deactivation take effect at once, not when the token expires.
// Requests without a token continue unauthenticated; the route guards decide.

import mongoose from "mongoose";
import { verifyAccessToken } from "#src/core/auth/tokens.js";
import { unauthorized } from "#src/core/errors.js";
import { User } from "../users/user.model.js";
import { Session } from "./session.model.js";

/** @param {{ jwtSecret: string }} config @returns {import("express").RequestHandler} */
export function authenticate({ jwtSecret }) {
  return async (req, _res, next) => {
    const header = req.get("authorization");
    if (!header) return next();
    const [kind, token] = header.split(" ");
    if (kind !== "Bearer" || !token)
      return next(unauthorized("token_invalid", "Please sign in again."));

    const { userId, sessionId } = await verifyAccessToken(token, jwtSecret);
    const [session, user] = await Promise.all([
      Session.findById(sessionId, { revokedAt: 1, expiresAt: 1, userId: 1 }).lean(),
      User.findById(userId, { name: 1, role: 1, stationId: 1, divisionId: 1, isActive: 1 }).lean(),
    ]);
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !user ||
      !user.isActive ||
      String(session.userId) !== userId
    ) {
      return next(unauthorized("session_ended", "Your session has ended. Please sign in again."));
    }
    req.auth = {
      userId: new mongoose.Types.ObjectId(userId),
      sessionId: new mongoose.Types.ObjectId(sessionId),
      role: /** @type {any} */ (user.role),
      name: user.name,
      stationId: user.stationId ?? null,
      divisionId: user.divisionId ?? null,
    };
    next();
  };
}

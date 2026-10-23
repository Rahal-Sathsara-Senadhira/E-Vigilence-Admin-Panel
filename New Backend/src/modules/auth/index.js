// What other modules may use from auth (docs/19 §4.2 rule 2).

import { Session } from "./session.model.js";

/**
 * Ends every open session of a user — after a role, station, password or
 * two-step change, or deactivation. They must sign in again.
 * @param {import("mongoose").Types.ObjectId} userId
 * @param {import("mongoose").ClientSession} [session]
 */
export async function endAllSessions(userId, session) {
  await Session.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: "account_changed" } },
    { session },
  );
}

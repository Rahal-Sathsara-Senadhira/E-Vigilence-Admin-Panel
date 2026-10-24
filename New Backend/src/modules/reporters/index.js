// What other modules may use from reporters (docs/02 §10).

import { ReporterAccount } from "./reporter-account.model.js";

/**
 * @typedef {object} ReporterStanding
 * @property {"active" | "flagged" | "suspended"} status
 * @property {string | null} reason
 * @property {string | null} since
 */

/**
 * The standing of mobile-app reporters, by account id. Accounts never
 * flagged or suspended are absent (= active).
 * @param {string[]} userIds
 * @returns {Promise<Map<string, ReporterStanding>>}
 */
export async function standingOf(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const accounts = await ReporterAccount.find(
    { userId: { $in: ids }, status: { $ne: "active" } },
    { userId: 1, status: 1, statusReason: 1, statusChangedAt: 1 },
  ).lean();
  return new Map(
    accounts.map((a) => [
      a.userId,
      {
        status: /** @type {ReporterStanding["status"]} */ (a.status),
        reason: a.statusReason ?? null,
        since: a.statusChangedAt ? a.statusChangedAt.toISOString() : null,
      },
    ]),
  );
}

/** Whether a citizen may not report (docs/11 §6). @param {string} userId */
export async function isSuspended(userId) {
  return Boolean(await ReporterAccount.exists({ userId, status: "suspended" }));
}

/**
 * Flags an active reporter, in the caller's transaction (docs/02 §10: too
 * many false or abusive reports). A reporter already flagged or suspended
 * is left as is. Returns whether the reporter was flagged now.
 * @param {import("mongoose").ClientSession} session
 * @param {string} userId @param {string} reason @param {string} by
 */
export async function flagReporter(session, userId, reason, by) {
  // Read first: a failed write would abort the caller's whole transaction.
  const existing = await ReporterAccount.findOne({ userId }, { status: 1 }, { session });
  if (existing && existing.status !== "active") return false;
  const now = new Date();
  // An upsert in the transaction: concurrent changes to the same account
  // conflict and are retried by the transaction, never lost.
  await ReporterAccount.updateOne(
    { userId },
    {
      $set: { status: "flagged", statusReason: reason, statusChangedAt: now, statusChangedBy: by },
      $push: { history: { at: now, status: "flagged", by, reason } },
    },
    { session, upsert: true },
  );
  return true;
}

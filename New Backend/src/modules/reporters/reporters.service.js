// HQ decisions on mobile-app reporters — docs/02 §10: suspend from
// reporting, or lift a flag or a suspension, always with a reason. The app
// enforces a suspension; the import refuses reports from suspended accounts.

import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { conflict } from "#src/core/errors.js";
import { ReporterAccount } from "./reporter-account.model.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */
/** @typedef {{ ip: string | null, userAgent: string | null }} RequestContext */

/** @param {Actor} actor */
const auditActor = (actor) => ({
  kind: /** @type {const} */ ("staff"),
  id: actor.userId,
  name: actor.name,
  role: actor.role,
});

/** @param {any} a */
const accountView = (a) => ({
  userId: a.userId,
  status: a.status,
  reason: a.statusReason ?? null,
  since: a.statusChangedAt ? a.statusChangedAt.toISOString() : null,
  by: a.statusChangedBy ?? null,
  history: (a.history ?? []).map((/** @type {any} */ h) => ({
    at: h.at.toISOString(),
    status: h.status,
    by: h.by,
    reason: h.reason,
  })),
});

/** The reporter's account; an account never acted on is active. @param {string} userId */
export async function getReporter(userId) {
  const a = await ReporterAccount.findOne({ userId }).lean();
  return a ? accountView(a) : accountView({ userId, status: "active", history: [] });
}

/** Flagged or suspended reporters, most recent first. @param {{ status?: "flagged" | "suspended" }} query */
export async function listReporters(query) {
  const accounts = await ReporterAccount.find({
    status: query.status ?? { $in: ["flagged", "suspended"] },
  })
    .sort({ statusChangedAt: -1 })
    .limit(200)
    .lean();
  return { items: accounts.map(accountView) };
}

/**
 * @param {Actor} actor @param {string} userId @param {"suspended" | "active"} to
 * @param {string} reason @param {RequestContext} ctx
 */
async function setStatus(actor, userId, to, reason, ctx) {
  await inTransaction(async (session) => {
    const current = await ReporterAccount.findOne({ userId }, null, { session });
    const from = current?.status ?? "active";
    if (from === to) {
      throw conflict(
        "no_change",
        to === "suspended"
          ? "This reporter is already suspended."
          : "This reporter isn't flagged or suspended.",
      );
    }
    const now = new Date();
    await ReporterAccount.updateOne(
      { userId },
      {
        $set: {
          status: to,
          statusReason: reason,
          statusChangedAt: now,
          statusChangedBy: actor.name,
        },
        $push: { history: { at: now, status: to, by: actor.name, reason } },
      },
      { session, upsert: true },
    );
    await recordAudit(
      {
        actor: auditActor(actor),
        action: to === "suspended" ? "reporters.suspended" : "reporters.reinstated",
        summary:
          to === "suspended"
            ? `Suspended a mobile-app reporter from reporting: ${reason}`
            : `Lifted the reporter's ${from === "flagged" ? "flag" : "suspension"}: ${reason}`,
        target: { type: "reporter", id: userId, label: `App account ${userId.slice(-6)}` },
        source: ctx,
        places: [],
      },
      session,
    );
  });
  return getReporter(userId);
}

/** @param {Actor} actor @param {string} userId @param {string} reason @param {RequestContext} ctx */
export const suspendReporter = (actor, userId, reason, ctx) =>
  setStatus(actor, userId, "suspended", reason, ctx);

/** @param {Actor} actor @param {string} userId @param {string} reason @param {RequestContext} ctx */
export const reinstateReporter = (actor, userId, reason, ctx) =>
  setStatus(actor, userId, "active", reason, ctx);

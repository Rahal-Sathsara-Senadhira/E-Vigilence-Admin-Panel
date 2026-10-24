// Citizen rewards for HQ — docs/16 §7, §9: the ledger by state, one
// citizen's account, holds and reversals after review, freezing or ending
// an account's rewards, and the expiry of unpaid points.

import mongoose from "mongoose";
import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { conflict, notFound } from "#src/core/errors.js";
import { publishUpdate } from "../reports/citizen-updates.js";
import { Report } from "../reports/report.model.js";
import { ReporterAccount } from "../reporters/index.js";
import { EXPIRY_WARNING_DAYS, LINES, refreshAccount, reverseEntry } from "./ledger.js";
import { RewardEntry } from "./reward.model.js";
import { entryView } from "./rewards.views.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */
/** @typedef {{ ip?: string | null, userAgent?: string | null }} RequestContext */

const DAY = 86_400_000;
const LIVE = ["pending", "confirmed"];

/** @type {Record<string, object>} */
const VIEWS = {
  held: { kind: "award", hold: { $ne: null }, status: { $in: LIVE } },
  pending: { kind: "award", hold: null, status: "pending" },
  confirmed: { status: "confirmed", hold: null },
  paid: { status: "paid" },
  reversed: { status: "reversed" },
  not_eligible: { status: "not_eligible" },
  expired: { status: "expired" },
  all: {},
};

/** Reporter names for entries, from their reports. @param {any[]} rows */
async function reporterNames(rows) {
  const reports = await Report.find(
    { _id: { $in: rows.map((e) => e.reportId) } },
    { reporter: 1 },
  ).lean();
  return new Map(reports.map((r) => [String(r._id), r.reporter?.name ?? null]));
}

/**
 * @param {{ view: string, q?: string, userId?: string, page: number, pageSize: number }} query
 */
export async function listEntries({ view, q, userId, page, pageSize }) {
  /** @type {Record<string, any>} */
  const filter = { ...(VIEWS[view] ?? VIEWS.all) };
  if (userId) filter.userId = userId;
  if (q) {
    const text = q.trim().toUpperCase();
    filter.$or = [
      { reportNumber: text },
      { caseNumber: text },
      { plate: text },
      { userId: q.trim() },
    ];
  }
  const [rows, total, held] = await Promise.all([
    RewardEntry.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    RewardEntry.countDocuments(filter),
    RewardEntry.countDocuments(VIEWS.held),
  ]);
  const names = await reporterNames(rows);
  return {
    items: rows.map((e) => entryView(e, names.get(String(e.reportId)) ?? null)),
    total,
    held,
    page,
    pageSize,
  };
}

/** One entry, with its history. @param {string} id */
export async function getEntry(id) {
  const e = await load(id);
  const names = await reporterNames([e]);
  return entryView(e.toObject(), names.get(String(e.reportId)) ?? null, { history: true });
}

/** @param {string} id */
async function load(id) {
  if (!mongoose.isValidObjectId(id)) throw notFound("Reward not found.");
  const e = await RewardEntry.findById(id);
  if (!e) throw notFound("Reward not found.");
  return e;
}

/** A citizen's reward account: standing, balance, freeze, latest entries. @param {string} userId */
export async function getAccount(userId) {
  const [account, entries] = await Promise.all([
    ReporterAccount.findOne({ userId }).lean(),
    RewardEntry.find({ userId }).sort({ updatedAt: -1 }).limit(100).lean(),
  ]);
  if (!account && entries.length === 0) throw notFound("No reward account for this citizen.");
  const names = await reporterNames(entries);
  const name = entries.map((e) => names.get(String(e.reportId))).find(Boolean) ?? null;
  return {
    userId,
    name,
    status: account?.status ?? "active",
    statusReason: account?.statusReason ?? null,
    balance: {
      pending: account?.balance?.pending ?? 0,
      available: account?.balance?.available ?? 0,
      paidOut: account?.balance?.paidOut ?? 0,
      expiringSoon: account?.balance?.expiringSoon ?? 0,
    },
    rewards: {
      frozen: Boolean(account?.rewards?.frozen),
      excluded: Boolean(account?.rewards?.excluded),
      fabricatedCount: account?.rewards?.fabricatedCount ?? 0,
      reason: account?.rewards?.reason ?? null,
      changedAt: account?.rewards?.changedAt?.toISOString() ?? null,
      changedBy: account?.rewards?.changedBy ?? null,
    },
    entries: entries.map((e) => entryView(e, names.get(String(e.reportId)) ?? null)),
  };
}

/**
 * One audited change by HQ to an entry.
 * @param {Actor} actor @param {import("./reward.model.js").RewardEntryDocument} e @param {RequestContext} ctx
 * @param {string} action @param {(session: import("mongoose").ClientSession) => Promise<string>} apply
 */
async function change(actor, e, ctx, action, apply) {
  await inTransaction(async (session) => {
    const summary = await apply(session);
    await recordAudit(
      {
        actor: { kind: "staff", id: actor.userId, name: actor.name, role: actor.role },
        action,
        summary,
        target: { type: "reward", id: String(e._id), label: e.reportNumber },
        source: ctx,
      },
      session,
    );
  });
}

/** Holds an award for review (staged offences and other patterns HQ spots, §7). @param {Actor} actor @param {string} id @param {string} reason @param {RequestContext} ctx */
export async function holdEntry(actor, id, reason, ctx) {
  const e = await load(id);
  if (e.kind !== "award" || !LIVE.includes(e.status) || e.hold)
    throw conflict(
      "wrong_state",
      "Only a pending or confirmed reward that isn't held can be held.",
    );
  await change(actor, e, ctx, "rewards.held", async (session) => {
    e.hold = { reason, by: actor.name, at: new Date() };
    e.history.push({ at: new Date(), event: "held", by: actor.name, note: reason });
    await e.save({ session });
    await tellReport(session, e, LINES.held());
    await refreshAccount(session, e.userId);
    return `Reward on ${e.reportNumber} held: ${reason}`;
  });
  return getEntry(id);
}

/** Releases a hold after review: the points carry on as they were. @param {Actor} actor @param {string} id @param {string} note @param {RequestContext} ctx */
export async function releaseHold(actor, id, note, ctx) {
  const e = await load(id);
  if (!e.hold || !LIVE.includes(e.status)) throw conflict("wrong_state", "This reward isn't held.");
  await change(actor, e, ctx, "rewards.released", async (session) => {
    e.hold = null;
    e.history.push({ at: new Date(), event: "released", by: actor.name, note });
    await e.save({ session });
    await tellReport(
      session,
      e,
      e.status === "confirmed" ? LINES.confirmed(e.points) : LINES.pending(e.points),
    );
    await refreshAccount(session, e.userId);
    return `Hold on the reward for ${e.reportNumber} released: ${note}`;
  });
  return getEntry(id);
}

/** Reverses an award after review (§7: staged offences, collusion). @param {Actor} actor @param {string} id @param {string} reason @param {RequestContext} ctx */
export async function reverseByHq(actor, id, reason, ctx) {
  const e = await load(id);
  if (e.kind !== "award" || !["pending", "confirmed", "paid"].includes(e.status) || e.recoveredBy)
    throw conflict("wrong_state", "This reward can't be reversed.");
  await change(actor, e, ctx, "rewards.reversed", async (session) => {
    e.hold = null;
    await reverseEntry(session, e, actor.name, reason, "This reward was reversed after review.");
    return `Reward on ${e.reportNumber} reversed: ${reason}`;
  });
  return getEntry(id);
}

/**
 * Freezes or unfreezes payouts, or ends an account's rewards (§7). Ending is
 * for repeated fabrication or staged offences; the account can still report.
 * @param {Actor} actor @param {string} userId
 * @param {{ frozen: boolean, excluded: boolean, reason: string }} input @param {RequestContext} ctx
 */
export async function setAccountRewards(actor, userId, input, ctx) {
  const account = await ReporterAccount.findOne({ userId }, { rewards: 1 }).lean();
  const was = {
    frozen: Boolean(account?.rewards?.frozen),
    excluded: Boolean(account?.rewards?.excluded),
  };
  if (was.frozen === input.frozen && was.excluded === input.excluded)
    throw conflict("unchanged", "Nothing to change.");
  await inTransaction(async (session) => {
    await ReporterAccount.updateOne(
      { userId },
      {
        $set: {
          "rewards.frozen": input.frozen || input.excluded,
          "rewards.excluded": input.excluded,
          "rewards.reason": input.reason,
          "rewards.changedAt": new Date(),
          "rewards.changedBy": actor.name,
        },
      },
      { session, upsert: true, setDefaultsOnInsert: true },
    );
    const what = input.excluded
      ? "excluded from rewards"
      : input.frozen
        ? "payouts frozen"
        : "rewards restored";
    await recordAudit(
      {
        actor: { kind: "staff", id: actor.userId, name: actor.name, role: actor.role },
        action: "rewards.account_changed",
        summary: `Citizen ${userId}: ${what} — ${input.reason}`,
        target: { type: "reporter", id: userId, label: userId },
        source: ctx,
      },
      session,
    );
  });
  return getAccount(userId);
}

/** A reward line on the entry's report. @param {import("mongoose").ClientSession} session @param {any} e @param {string} message */
async function tellReport(session, e, message) {
  const r = await Report.findById(
    e.reportId,
    { channel: 1, reportNumber: 1, source: 1 },
    { session },
  ).lean();
  if (r)
    await publishUpdate(session, r, { type: "reward", title: "Reward", message, question: null });
}

/**
 * Confirmed points not paid out lapse after the expiry period (D16-5); the
 * citizen is warned 30 days before. Held points don't lapse while HQ
 * reviews them, nor do pending ones (§10).
 * @param {Date} [now]
 */
export async function runRewardSweep(now = new Date()) {
  let expired = 0;
  let warned = 0;
  const lapsing = await RewardEntry.find({
    kind: "award",
    status: "confirmed",
    hold: null,
    payoutId: null,
    expiresAt: { $lte: now },
  });
  for (const e of lapsing) {
    await inTransaction(async (session) => {
      e.status = "expired";
      e.history.push({ at: now, event: "expired", by: "Rewards", note: null });
      await e.save({ session });
      await tellReport(session, e, LINES.expired(e.points));
      await refreshAccount(session, e.userId);
    });
    expired += 1;
  }
  const soon = await RewardEntry.find({
    kind: "award",
    status: "confirmed",
    hold: null,
    payoutId: null,
    expiryWarnedAt: null,
    expiresAt: { $gt: now, $lte: new Date(now.getTime() + EXPIRY_WARNING_DAYS * DAY) },
  });
  for (const e of soon) {
    await inTransaction(async (session) => {
      e.expiryWarnedAt = now;
      await e.save({ session });
      const date = /** @type {Date} */ (e.expiresAt).toISOString().slice(0, 10);
      await tellReport(
        session,
        e,
        `${e.points} reward points expire on ${date}. Ask for a payout before then.`,
      );
      await refreshAccount(session, e.userId);
    });
    warned += 1;
  }
  return { expired, warned };
}

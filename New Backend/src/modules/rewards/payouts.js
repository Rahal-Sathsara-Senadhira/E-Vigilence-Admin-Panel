// Payouts — docs/16 §6. Requests come from the app; each sets aside the
// citizen's available points at once (oldest-expiring first, net of any
// recovery, within the monthly cap), so the same points can't be asked for
// twice or lapse while waiting. Finance pays them in weekly batches: one
// officer prepares a batch, another approves it (as with refunds, S4).
// Approval pays each payout through the simulator (D16-10).

import mongoose from "mongoose";
import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { nextNumber } from "#src/core/db/counters.js";
import { conflict, forbidden, notFound } from "#src/core/errors.js";
import { recordNumber } from "#src/core/srilanka.js";
import { ReporterAccount } from "../reporters/index.js";
import { refreshAccount } from "./ledger.js";
import { payOut } from "./payout-simulator.js";
import { Payout, PayoutBatch } from "./payout.model.js";
import { RewardEntry } from "./reward.model.js";
import { rulesAt } from "./rules.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */
/** @typedef {{ ip?: string | null, userAgent?: string | null }} RequestContext */
/** @typedef {import("mongoose").ClientSession} Session */

const DAY = 86_400_000;
const SYSTEM = { kind: /** @type {const} */ ("system"), id: null, name: "Rewards" };
/** Sri Lanka is UTC+5:30, all year. */
const COLOMBO = 5.5 * 3_600_000;

/** Rupees for points at the rules' rate, whole rupees down. @param {number} points @param {number} rate */
export const rupeesFor = (points, rate) => Math.floor((points * rate) / 100);

/** The first moment of the Sri Lankan calendar month of `at`. @param {Date} at */
function monthStart(at) {
  const local = new Date(at.getTime() + COLOMBO);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - COLOMBO);
}

/** "•••• 4321" @param {string} account */
const mask = (account) => `•••• ${account.slice(-4)}`;

// ── Requests from the app ───────────────────────────────────────────────

/**
 * Reads new payout requests from the app (docs/11 §6). Each is answered
 * through `reward_accounts`; the app's own collection is never written.
 * @param {Date} [now]
 */
export async function importPayoutRequests(now = new Date()) {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected.");
  const last = await Payout.findOne({}, { requestedAt: 1 }).sort({ requestedAt: -1 }).lean();
  // A day's overlap: a request saved late with an earlier time isn't missed.
  const since = last ? new Date(last.requestedAt.getTime() - DAY) : new Date(0);
  const rows = await db
    .collection("payout_requests")
    .find({ createdAt: { $gte: since } })
    .sort({ createdAt: 1 })
    .limit(200)
    .toArray();
  let received = 0;
  for (const r of rows) {
    if (await Payout.exists({ requestId: r._id })) continue;
    await inTransaction((session) => receiveRequest(session, r, now));
    received += 1;
  }
  return received;
}

/** @param {Session} session @param {any} r the app's request @param {Date} now */
async function receiveRequest(session, r, now) {
  const userId = typeof r.userId === "string" ? r.userId : r.userId ? String(r.userId) : null;
  const method = r.method === "bank" || r.method === "wallet" ? r.method : null;
  const account = String(r.accountNumber ?? r.walletNumber ?? "").replace(/\D/g, "");
  const base = {
    requestId: r._id,
    userId: userId ?? "unknown",
    method: method ?? "bank",
    accountMasked: account.length >= 4 ? mask(account) : "—",
    points: 0,
    amount: 0,
    requestedAt: r.createdAt instanceof Date ? r.createdAt : now,
  };
  /** @param {string} reason */
  const reject = async (reason) => {
    const [p] = await Payout.create(
      [
        {
          ...base,
          status: "rejected",
          reason,
          history: [{ at: now, event: "rejected", by: SYSTEM.name, note: reason }],
        },
      ],
      { session },
    );
    if (userId) await refreshAccount(session, userId);
    await audit(
      session,
      SYSTEM,
      "rewards.payout_rejected",
      p,
      `Payout request rejected: ${reason}`,
    );
  };

  if (!userId || !method || account.length < 6)
    return reject("The payout details were incomplete. Check them in the app and ask again.");
  const holder = await ReporterAccount.findOne({ userId }, { rewards: 1 }, { session }).lean();
  if (holder?.rewards?.excluded) return reject("This account can no longer receive rewards.");
  if (holder?.rewards?.frozen) return reject("Payouts are on hold while your account is reviewed.");

  const rules = await rulesAt(now);
  const used = await Payout.aggregate([
    {
      $match: {
        userId,
        status: { $in: ["requested", "batched", "paid", "failed"] },
        requestedAt: { $gte: monthStart(now) },
      },
    },
    { $group: { _id: null, amount: { $sum: "$amount" } } },
  ]).session(session);
  const capLeft = rules.monthlyCapRupees - (used[0]?.amount ?? 0);
  if (capLeft <= 0)
    return reject("You have reached this month's payout limit. Ask again next month.");

  // Recoveries first, then the points closest to expiring.
  const free = await RewardEntry.find(
    { userId, status: "confirmed", hold: null, payoutId: null },
    null,
    { session },
  ).lean();
  free.sort((a, b) =>
    a.points < 0 !== b.points < 0
      ? a.points < 0
        ? -1
        : 1
      : (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity),
  );
  let points = 0;
  /** @type {any[]} */
  const chosen = [];
  let capped = false;
  for (const e of free) {
    const next = points + e.points;
    if (e.points < 0 || rupeesFor(next, rules.rupeesPer100Points) <= capLeft) {
      points = next;
      chosen.push(e._id);
    } else capped = true;
  }
  if (points < rules.minPayoutPoints)
    return reject(
      `You need at least ${rules.minPayoutPoints} confirmed points to ask for a payout.`,
    );

  const amount = rupeesFor(points, rules.rupeesPer100Points);
  const [p] = await Payout.create(
    [
      {
        ...base,
        points,
        amount,
        capped,
        entryIds: chosen,
        status: "requested",
        history: [
          {
            at: now,
            event: "requested",
            by: SYSTEM.name,
            note: capped ? "Monthly cap reached: part of the points set aside" : null,
          },
        ],
      },
    ],
    { session },
  );
  await RewardEntry.updateMany(
    { _id: { $in: chosen } },
    { $set: { payoutId: p?._id } },
    { session },
  );
  await refreshAccount(session, userId);
  await audit(session, SYSTEM, "rewards.payout_requested", p, `Payout of Rs ${amount} requested`);
}

/** @param {Session} session @param {any} actor @param {string} action @param {any} p @param {string} summary @param {RequestContext} [ctx] */
async function audit(session, actor, action, p, summary, ctx) {
  await recordAudit(
    {
      actor:
        actor.kind === "system"
          ? actor
          : { kind: "staff", id: actor.userId, name: actor.name, role: actor.role },
      action,
      summary,
      target: { type: "reward_payout", id: String(p?._id), label: p?.userId ?? null },
      source: ctx,
    },
    session,
  );
}

// ── Paying ──────────────────────────────────────────────────────────────

/**
 * Pays one payout through the simulator: its entries become paid; a refusal
 * leaves them set aside for a retry or a rejection.
 * @param {Session} session @param {any} p @param {string} by
 */
async function pay(session, p, by) {
  const now = new Date();
  const r = payOut({ method: p.method, accountMasked: p.accountMasked, amount: p.amount });
  if (r.ok) {
    p.status = "paid";
    p.reference = r.reference;
    p.paidAt = now;
    p.reason = null;
    p.history.push({ at: now, event: "paid", by, note: r.reference });
    await RewardEntry.updateMany(
      { _id: { $in: p.entryIds } },
      {
        $set: { status: "paid" },
        $push: { history: { at: now, event: "paid", by, note: r.reference } },
      },
      { session },
    );
  } else {
    p.status = "failed";
    p.reason = r.error;
    p.history.push({ at: now, event: "failed", by, note: r.error });
  }
  await p.save({ session });
  await refreshAccount(session, p.userId);
  return r.ok;
}

/** Releases a payout's points back to the citizen's available balance. @param {Session} session @param {any} p */
async function release(session, p) {
  await RewardEntry.updateMany(
    { _id: { $in: p.entryIds }, status: "confirmed" },
    { $set: { payoutId: null } },
    { session },
  );
}

/**
 * Prepares this week's batch: every waiting request, or the ones chosen.
 * @param {Actor} actor @param {{ payoutIds?: string[] }} input @param {RequestContext} ctx
 */
export async function prepareBatch(actor, input, ctx) {
  /** @type {Record<string, any>} */
  const filter = {
    status: "requested",
    ...(input.payoutIds?.length ? { _id: { $in: input.payoutIds } } : {}),
  };
  const payouts = await Payout.find(filter).sort({ requestedAt: 1 }).lean();
  if (payouts.length === 0) throw conflict("nothing_to_pay", "No payout requests are waiting.");
  const id = await inTransaction(async (session) => {
    const number = recordNumber("PB", await nextNumber("reward_batches", session));
    const [batch] = await PayoutBatch.create(
      [
        {
          number,
          status: "prepared",
          payoutIds: payouts.map((p) => p._id),
          points: payouts.reduce((s, p) => s + p.points, 0),
          amount: payouts.reduce((s, p) => s + p.amount, 0),
          preparedBy: { id: actor.userId, name: actor.name },
          preparedAt: new Date(),
        },
      ],
      { session },
    );
    const moved = await Payout.updateMany(
      { _id: { $in: payouts.map((p) => p._id) }, status: "requested" },
      {
        $set: { status: "batched", batchId: batch?._id },
        $push: { history: { at: new Date(), event: "batched", by: actor.name, note: number } },
      },
      { session },
    );
    if (moved.modifiedCount !== payouts.length)
      throw conflict("changed", "Some requests changed meanwhile. Prepare the batch again.");
    for (const userId of new Set(payouts.map((p) => p.userId)))
      await refreshAccount(session, userId);
    await recordAudit(
      {
        actor: { kind: "staff", id: actor.userId, name: actor.name, role: actor.role },
        action: "rewards.batch_prepared",
        summary: `Payout batch ${number} prepared: ${payouts.length} payouts, Rs ${batch?.amount}`,
        target: { type: "reward_batch", id: String(batch?._id), label: number },
        source: ctx,
      },
      session,
    );
    return String(batch?._id);
  });
  return getBatch(id);
}

/** @param {string} id */
async function loadBatch(id) {
  if (!mongoose.isValidObjectId(id)) throw notFound("Batch not found.");
  const b = await PayoutBatch.findById(id);
  if (!b) throw notFound("Batch not found.");
  return b;
}

/**
 * Approves a batch — never the officer who prepared it — and pays it.
 * @param {Actor} actor @param {string} id @param {RequestContext} ctx
 */
export async function approveBatch(actor, id, ctx) {
  const b = await loadBatch(id);
  if (b.status !== "prepared")
    throw conflict("wrong_state", "This batch isn't waiting for approval.");
  if (String(b.preparedBy.id) === String(actor.userId))
    throw forbidden("You prepared this batch; another finance officer approves it.");
  await inTransaction(async (session) => {
    b.status = "approved";
    b.approvedBy = { id: actor.userId, name: actor.name };
    b.approvedAt = new Date();
    await b.save({ session });
    await recordAudit(
      {
        actor: { kind: "staff", id: actor.userId, name: actor.name, role: actor.role },
        action: "rewards.batch_approved",
        summary: `Payout batch ${b.number} approved: Rs ${b.amount}`,
        target: { type: "reward_batch", id: String(b._id), label: b.number },
        source: ctx,
      },
      session,
    );
  });
  await payApprovedBatches();
  return getBatch(id);
}

/**
 * Pays every payout still waiting in an approved batch — straight after
 * approval, and again by the sweep if the server stopped part-way.
 */
export async function payApprovedBatches() {
  const batches = await PayoutBatch.find({ status: "approved" }, { _id: 1, number: 1 }).lean();
  let paid = 0;
  let failed = 0;
  for (const b of batches) {
    const waiting = await Payout.find({ batchId: b._id, status: "batched" }, { _id: 1 }).lean();
    for (const { _id } of waiting) {
      const ok = await inTransaction(async (session) => {
        const p = await Payout.findOne({ _id, status: "batched" }, null, { session });
        return p ? pay(session, p, `Batch ${b.number}`) : null;
      });
      if (ok === true) paid += 1;
      if (ok === false) failed += 1;
    }
  }
  return { paid, failed };
}

/** The preparer or another finance officer cancels a batch not yet approved. @param {Actor} actor @param {string} id @param {RequestContext} ctx */
export async function cancelBatch(actor, id, ctx) {
  const b = await loadBatch(id);
  if (b.status !== "prepared")
    throw conflict("wrong_state", "Only a batch waiting for approval can be cancelled.");
  await inTransaction(async (session) => {
    b.status = "cancelled";
    b.cancelledAt = new Date();
    await b.save({ session });
    await Payout.updateMany(
      { batchId: b._id, status: "batched" },
      {
        $set: { status: "requested", batchId: null },
        $push: { history: { at: new Date(), event: "unbatched", by: actor.name, note: b.number } },
      },
      { session },
    );
    for (const userId of await Payout.distinct("userId", { _id: { $in: b.payoutIds } }).session(
      session,
    ))
      await refreshAccount(session, userId);
    await recordAudit(
      {
        actor: { kind: "staff", id: actor.userId, name: actor.name, role: actor.role },
        action: "rewards.batch_cancelled",
        summary: `Payout batch ${b.number} cancelled`,
        target: { type: "reward_batch", id: String(b._id), label: b.number },
        source: ctx,
      },
      session,
    );
  });
  return getBatch(id);
}

/** @param {string} id */
async function loadPayout(id) {
  if (!mongoose.isValidObjectId(id)) throw notFound("Payout not found.");
  const p = await Payout.findById(id);
  if (!p) throw notFound("Payout not found.");
  return p;
}

/** Tries a failed payout again (the citizen corrected the account in the app). @param {Actor} actor @param {string} id @param {RequestContext} ctx */
export async function retryPayout(actor, id, ctx) {
  const p = await loadPayout(id);
  if (p.status !== "failed")
    throw conflict("wrong_state", "Only a failed payout can be tried again.");
  await inTransaction(async (session) => {
    const ok = await pay(session, p, actor.name);
    await audit(
      session,
      actor,
      "rewards.payout_retried",
      p,
      `Payout retried: ${ok ? "paid" : "failed again"}`,
      ctx,
    );
  });
  return payoutView(p.toObject());
}

/** Rejects a waiting or failed payout; its points go back to the citizen. @param {Actor} actor @param {string} id @param {string} reason @param {RequestContext} ctx */
export async function rejectPayout(actor, id, reason, ctx) {
  const p = await loadPayout(id);
  if (!["requested", "failed"].includes(p.status))
    throw conflict("wrong_state", "Only a waiting or failed payout can be rejected.");
  await inTransaction(async (session) => {
    p.status = "rejected";
    p.reason = reason;
    p.history.push({ at: new Date(), event: "rejected", by: actor.name, note: reason });
    await p.save({ session });
    await release(session, p);
    await refreshAccount(session, p.userId);
    await audit(session, actor, "rewards.payout_rejected", p, `Payout rejected: ${reason}`, ctx);
  });
  return payoutView(p.toObject());
}

// ── Reading ─────────────────────────────────────────────────────────────

/** @param {any} p */
export function payoutView(p) {
  const iso = (/** @type {Date | null | undefined} */ d) => (d ? new Date(d).toISOString() : null);
  return {
    id: String(p._id),
    userId: p.userId,
    method: p.method,
    accountMasked: p.accountMasked,
    points: p.points,
    amount: p.amount,
    capped: Boolean(p.capped),
    status: p.status,
    reason: p.reason ?? null,
    batchId: p.batchId ? String(p.batchId) : null,
    reference: p.reference ?? null,
    requestedAt: iso(p.requestedAt),
    paidAt: iso(p.paidAt),
    history: (p.history ?? []).map((/** @type {any} */ h) => ({
      at: iso(h.at),
      event: h.event,
      by: h.by,
      note: h.note ?? null,
    })),
  };
}

/** @param {{ view: string, userId?: string, page: number, pageSize: number }} query */
export async function listPayouts({ view, userId, page, pageSize }) {
  /** @type {Record<string, any>} */
  const filter = view === "all" ? {} : { status: view };
  if (userId) filter.userId = userId;
  const [rows, total, waiting] = await Promise.all([
    Payout.find(filter)
      .sort({ requestedAt: view === "requested" ? 1 : -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Payout.countDocuments(filter),
    Payout.aggregate([
      { $match: { status: "requested" } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: "$amount" } } },
    ]),
  ]);
  return {
    items: rows.map(payoutView),
    total,
    waiting: { count: waiting[0]?.count ?? 0, amount: waiting[0]?.amount ?? 0 },
    page,
    pageSize,
  };
}

/** @param {any} b */
const batchView = (b) => ({
  id: String(b._id),
  number: b.number,
  status: b.status,
  count: b.payoutIds.length,
  points: b.points,
  amount: b.amount,
  preparedBy: b.preparedBy?.name ?? null,
  preparedById: b.preparedBy?.id ? String(b.preparedBy.id) : null,
  preparedAt: b.preparedAt?.toISOString() ?? null,
  approvedBy: b.approvedBy?.name ?? null,
  approvedAt: b.approvedAt?.toISOString() ?? null,
  cancelledAt: b.cancelledAt?.toISOString() ?? null,
});

/** @param {{ page: number, pageSize: number }} query */
export async function listBatches({ page, pageSize }) {
  const [rows, total] = await Promise.all([
    PayoutBatch.find()
      .sort({ preparedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    PayoutBatch.countDocuments(),
  ]);
  return { items: rows.map(batchView), total, page, pageSize };
}

/** A batch with its payouts. @param {string} id */
export async function getBatch(id) {
  const b = await loadBatch(id);
  const payouts = await Payout.find({ _id: { $in: b.payoutIds } })
    .sort({ requestedAt: 1 })
    .lean();
  return { ...batchView(b), payouts: payouts.map(payoutView) };
}

/**
 * Totals for finance by month (docs/16 §9): points earned, confirmed,
 * reversed, and paid out with their amount — in Sri Lanka time.
 * @param {number} months
 */
export async function rewardTotals(months) {
  const from = monthStart(new Date(Date.now() - (months - 1) * 31 * DAY));
  const month = (/** @type {string} */ field) => ({
    $dateToString: { format: "%Y-%m", date: field, timezone: "+05:30" },
  });
  const [earned, confirmed, reversed, paid] = await Promise.all([
    RewardEntry.aggregate([
      { $match: { kind: "award", status: { $ne: "not_eligible" }, createdAt: { $gte: from } } },
      { $group: { _id: month("$createdAt"), points: { $sum: "$points" } } },
    ]),
    RewardEntry.aggregate([
      { $match: { kind: "award", confirmedAt: { $gte: from } } },
      { $group: { _id: month("$confirmedAt"), points: { $sum: "$points" } } },
    ]),
    RewardEntry.aggregate([
      { $match: { kind: "award", status: "reversed", updatedAt: { $gte: from } } },
      { $group: { _id: month("$updatedAt"), points: { $sum: "$points" } } },
    ]),
    Payout.aggregate([
      { $match: { status: "paid", paidAt: { $gte: from } } },
      {
        $group: {
          _id: month("$paidAt"),
          points: { $sum: "$points" },
          amount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);
  const by = (/** @type {any[]} */ rows) => new Map(rows.map((r) => [r._id, r]));
  const [e, c, r, p] = [by(earned), by(confirmed), by(reversed), by(paid)];
  const keys = [...new Set([...e.keys(), ...c.keys(), ...r.keys(), ...p.keys()])].sort().reverse();
  return {
    months: keys.map((k) => ({
      month: k,
      earned: e.get(k)?.points ?? 0,
      confirmed: c.get(k)?.points ?? 0,
      reversed: r.get(k)?.points ?? 0,
      paidPoints: p.get(k)?.points ?? 0,
      paidAmount: p.get(k)?.amount ?? 0,
      payouts: p.get(k)?.count ?? 0,
    })),
  };
}

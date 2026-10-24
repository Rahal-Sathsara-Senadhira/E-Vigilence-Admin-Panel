// Payments — docs/07. A notice is marked paid only by a signed
// confirmation (online, P5) or a recorded receipt that HQ reviews (§6) —
// never by changing a status. The amount always comes from the notice (P1);
// a reference is processed once (P2).

import { randomUUID } from "node:crypto";
import path from "node:path";
import mongoose from "mongoose";
import { scopeOf } from "#src/core/access/permissions.js";
import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { AppError, conflict, forbidden, notFound, validationError } from "#src/core/errors.js";
import { createRateLimiter } from "#src/core/http/rate-limit.js";
import { normalizeNic } from "#src/core/srilanka.js";
import {
  Notice,
  PAYABLE_STATUSES,
  markNoticePaid,
  onPaidNoticeWithdrawn,
  unmarkNoticePaid,
} from "../notices/index.js";
import { Station } from "../organisation/organisation.model.js";
import { personById } from "../registers/index.js";
import { Payment } from "./payment.model.js";
import { paymentView } from "./payments.views.js";
import { canonical, reference, refund as simulatorRefund, sign, verify } from "./simulator.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */
/** @typedef {{ ip: string | null, userAgent: string | null }} RequestContext */
/** @typedef {import("./payment.model.js").PaymentDocument} PaymentDocument */

const SIMULATOR = { kind: /** @type {const} */ ("system"), id: null, name: "Payment simulator" };
const BANK_DELAY_MS = 60_000;
const STALE_MS = 24 * 3_600_000;

/** The shared secret for confirmations; a random one per process when unset (development and tests). */
let secret = randomUUID() + randomUUID();
/** @param {{ PAYMENTS_SIM_SECRET?: string }} env */
export function configurePayments(env) {
  if (env.PAYMENTS_SIM_SECRET) secret = env.PAYMENTS_SIM_SECRET;
}

/** 5 failed look-ups per 10 minutes per address, then a block (D07-1). */
export const paymentLookupLimiter = createRateLimiter({
  max: 5,
  windowMs: 10 * 60_000,
  message: "Too many tries. Wait 10 minutes and try again.",
});

/** Why a notice can't be paid online, in the payer's words (docs/07 §5.1). @param {any} n */
function notPayable(n) {
  const why = {
    paid: "This notice is already paid.",
    withdrawn: "This notice was withdrawn; nothing is due.",
    transferred: "This notice was passed to the named driver; they pay their own notice.",
    court_referral: "This matter has gone to court; the court will decide.",
    closed: "Nothing is due on this notice.",
  };
  return why[/** @type {keyof typeof why} */ (n.status)] ?? "This notice can't be paid now.";
}

// ── Online (no sign-in) ─────────────────────────────────────────────────

/**
 * Starts an online payment (docs/07 §5.1): the notice number and the
 * addressee's ID number (NIC, or business registration number) must match.
 * Only failed tries count towards the limit.
 * @param {{ noticeNumber: string, idNumber: string }} input @param {string} ip
 */
export async function startOnline(input, ip) {
  paymentLookupLimiter.check(ip);
  const n = await Notice.findOne({
    noticeNumber: input.noticeNumber.trim().toUpperCase(),
    kind: "penalty",
  });
  const person = n ? await personById(n.addressee.personId) : null;
  const id = input.idNumber.replace(/\s+/g, "").toUpperCase();
  const matches =
    person &&
    ((person.nic && normalizeNic(id) === person.nic) ||
      (person.businessRegNo && id === person.businessRegNo));
  if (!n || !matches) {
    paymentLookupLimiter.hit(ip);
    throw notFound("No notice matches that number and ID number. Check both and try again.");
  }
  if (!(/** @type {readonly string[]} */ (PAYABLE_STATUSES).includes(n.status))) {
    throw conflict("not_payable", notPayable(n));
  }
  const sessionId = randomUUID();
  await Payment.create({
    sessionId,
    channel: "online",
    status: "pending",
    noticeId: n._id,
    noticeNumber: n.noticeNumber,
    caseId: n.caseId,
    stationId: n.stationId,
    amount: /** @type {number} */ (n.amount),
    recordedBy: { id: null, name: SIMULATOR.name },
    history: [{ at: new Date(), event: "started", by: "Payer (online)" }],
  });
  return { sessionId };
}

/** @param {string} sessionId */
async function bySession(sessionId) {
  const p =
    sessionId && /^[0-9a-f-]{36}$/.test(sessionId) ? await Payment.findOne({ sessionId }) : null;
  if (!p) throw notFound("This payment session doesn't exist. Start again from the notice.");
  return p;
}

/** What the simulator page shows. @param {string} sessionId */
export async function simulatorSession(sessionId) {
  const p = await bySession(sessionId);
  const n = await Notice.findById(p.noticeId, { vehicle: 1, offences: 1 }).lean();
  return {
    noticeNumber: p.noticeNumber,
    plate: n?.vehicle?.plate ?? null,
    offences: (n?.offences ?? []).map((o) => o.name),
    amount: p.amount,
    status: p.status,
    method: p.method,
    failureReason: p.failureReason,
    bankDelay: Boolean(p.completeAfter && p.status === "pending"),
    reference: p.status === "succeeded" ? p.reference : null,
    receivedAt: p.receivedAt ? p.receivedAt.toISOString() : null,
    refunded: p.refund?.status === "refunded",
  };
}

/**
 * The payer picks an outcome on the simulator (D07-4). Success sends a
 * signed confirmation, exactly as a real gateway would call us.
 * @param {string} sessionId @param {{ method: "card" | "wallet", outcome: "success" | "declined" | "cancel" | "delay" }} input
 */
export async function simulatorOutcome(sessionId, input) {
  const p = await bySession(sessionId);
  if (p.status !== "pending" || p.completeAfter)
    throw conflict("done", "This payment has already finished.");
  p.method = input.method === "card" ? "sim_card" : "sim_wallet";
  if (input.outcome === "cancel" || input.outcome === "declined") {
    p.status = "failed";
    p.failureReason = input.outcome === "cancel" ? "cancelled" : "declined";
    p.history.push({ at: new Date(), event: p.failureReason, by: SIMULATOR.name });
    await p.save();
    return simulatorSession(sessionId);
  }
  if (input.outcome === "delay") {
    p.completeAfter = new Date(Date.now() + BANK_DELAY_MS);
    p.history.push({ at: new Date(), event: "bank_delay", by: SIMULATOR.name });
    await p.save();
    return simulatorSession(sessionId);
  }
  await p.save();
  await sendConfirmation(p);
  return simulatorSession(sessionId);
}

/** The simulator's side: a signed confirmation for a successful payment. @param {PaymentDocument} p */
async function sendConfirmation(p) {
  const payload = canonical({
    sessionId: p.sessionId,
    reference: reference("SIM"),
    amount: p.amount,
    noticeNumber: p.noticeNumber,
    outcome: "succeeded",
    at: new Date().toISOString(),
  });
  await receiveConfirmation(payload, sign(payload, secret));
}

/**
 * Our side: a confirmation from the provider (docs/07 §5.2). Checked
 * before anything changes: the signature, the reference (once only), the
 * amount against the payment and notice. A notice that can no longer be
 * paid — paid already, withdrawn meanwhile — is refunded automatically
 * and flagged (§12).
 * @param {string} payloadText @param {string} signature
 */
export async function receiveConfirmation(payloadText, signature) {
  if (!verify(payloadText, signature, secret)) {
    throw new AppError(401, "bad_signature", "The confirmation's signature is not valid.");
  }
  /** @type {any} */
  const c = JSON.parse(payloadText);
  if (await Payment.exists({ reference: c.reference })) {
    throw conflict("duplicate", "This payment reference was already processed.");
  }
  const p = await bySession(c.sessionId);
  if (p.status !== "pending") throw conflict("done", "This payment has already finished.");
  if (c.amount !== p.amount) {
    p.flags.push("bad_amount");
    p.history.push({
      at: new Date(),
      event: "rejected",
      by: SIMULATOR.name,
      note: `Amount ${c.amount} ≠ ${p.amount}`,
    });
    await p.save();
    throw conflict("bad_amount", "The confirmed amount doesn't match the notice.");
  }
  await inTransaction(async (session) => {
    const fresh = await Payment.findOne({ _id: p._id, status: "pending" }, null, { session });
    if (!fresh) throw conflict("done", "This payment has already finished.");
    const now = new Date();
    fresh.status = "succeeded";
    fresh.reference = c.reference;
    fresh.receivedAt = now;
    fresh.completeAfter = null;
    fresh.confirmation = { payload: payloadText, signature, receivedAt: now };
    fresh.history.push({ at: now, event: "succeeded", by: SIMULATOR.name, note: c.reference });
    const n = await Notice.findById(fresh.noticeId, null, { session });
    const payable = n && /** @type {readonly string[]} */ (PAYABLE_STATUSES).includes(n.status);
    if (n && payable && n.amount === fresh.amount) {
      await markNoticePaid(session, n, { reference: c.reference, by: "Online payment" });
    } else {
      // Paid twice, or withdrawn meanwhile: the money goes back (D07-3).
      fresh.flags.push(n?.status === "paid" ? "double_payment" : "notice_not_payable");
      const r = simulatorRefund();
      fresh.refund = {
        status: "refunded",
        reason: n?.status === "paid" ? "Notice already paid" : `Notice ${n?.status ?? "missing"}`,
        automatic: true,
        dueAt: now,
        refundedAt: now,
        reference: r.reference,
      };
      fresh.history.push({ at: now, event: "refunded", by: SIMULATOR.name, note: r.reference });
    }
    await fresh.save({ session });
    await recordAudit(
      {
        actor: SIMULATOR,
        action: fresh.refund ? "payments.refunded_automatically" : "payments.received",
        summary: fresh.refund
          ? `Payment ${c.reference} for ${fresh.noticeNumber} refunded automatically (${fresh.flags.join(", ")})`
          : `Rs. ${fresh.amount.toLocaleString("en-LK")} received online for ${fresh.noticeNumber} (${c.reference})`,
        target: { type: "notice", id: String(fresh.noticeId), label: fresh.noticeNumber },
        source: { ip: null, userAgent: "payment-simulator" },
        places: [{ stationId: fresh.stationId }],
      },
      session,
    );
  });
}

/** The payer's receipt (docs/07 §5.2). @param {string} sessionId */
export async function onlineReceipt(sessionId) {
  const p = await bySession(sessionId);
  if (p.status !== "succeeded") throw notFound("There is no completed payment for this session.");
  return {
    reference: p.reference,
    noticeNumber: p.noticeNumber,
    amount: p.amount,
    method: p.method,
    receivedAt: p.receivedAt ? p.receivedAt.toISOString() : null,
    refunded: p.refund?.status === "refunded" ? p.refund.reference : null,
  };
}

// ── Staff ───────────────────────────────────────────────────────────────

/** @param {Actor} actor */
async function scopeFilter(actor) {
  const scope = scopeOf(actor.role, "payments.view");
  if (scope === "N" || scope === "R") return {};
  if (scope === "S") return { stationId: actor.stationId };
  if (scope === "D")
    return {
      stationId: { $in: await Station.find({ divisionId: actor.divisionId }).distinct("_id") },
    };
  throw forbidden();
}

/** @param {Actor} actor @param {string} id */
async function loadVisible(actor, id) {
  if (!mongoose.isValidObjectId(id)) throw notFound("Payment not found.");
  const p = await Payment.findOne({ _id: id, ...(await scopeFilter(actor)) });
  if (!p) throw notFound("Payment not found.");
  return p;
}

/** @param {Actor} actor @param {any} query */
export async function listPayments(actor, query) {
  /** @type {Record<string, any>} */
  const views = {
    all: { status: { $ne: "pending" } },
    receipts_to_review: { channel: "receipt", status: "succeeded", review: null },
    refunds_due: { "refund.status": "due" },
    refunded: { "refund.status": "refunded" },
    flagged: { flags: { $ne: [] } },
  };
  const filter = {
    ...(await scopeFilter(actor)),
    ...(views[query.view] ?? views.all),
    ...(query.q
      ? {
          $or: [
            { noticeNumber: query.q.trim().toUpperCase() },
            { reference: query.q.trim().toUpperCase() },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    Payment.countDocuments(filter),
  ]);
  return {
    items: rows.map((p) => paymentView(p, actor)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** @param {Actor} actor @param {string} id */
export async function getPayment(actor, id) {
  return paymentView((await loadVisible(actor, id)).toObject(), actor);
}

/** The receipt scan, for the reviewer. @param {Actor} actor @param {string} id @param {import("#src/core/storage.js").Storage} storage */
export async function receiptScan(actor, id, storage) {
  const p = await loadVisible(actor, id);
  if (!p.receipt) throw notFound("This payment has no receipt scan.");
  return { file: await storage.get(p.receipt.scanKey), mime: p.receipt.scanMime };
}

/**
 * Staff record a fine paid at a cash agent, post office or bank (docs/07
 * §6): receipt number, amount (must equal the notice's), date and a scan
 * (required). The notice is paid now; HQ reviews every receipt.
 * @param {Actor} actor @param {string} noticeId @param {any} input
 * @param {import("../evidence/receive-upload.js").ReceivedFile} scan
 * @param {import("#src/core/storage.js").Storage} storage @param {RequestContext} ctx
 */
export async function recordReceipt(actor, noticeId, input, scan, storage, ctx) {
  try {
    if (!mongoose.isValidObjectId(noticeId)) throw notFound("Notice not found.");
    const n = await Notice.findById(noticeId);
    const scope = scopeOf(actor.role, "payments.recordReceipt");
    if (!n || (scope === "S" && String(n.stationId) !== String(actor.stationId)))
      throw notFound("Notice not found.");
    if (n.kind !== "penalty") throw conflict("not_payable", "Warning letters have nothing to pay.");
    if (!(/** @type {readonly string[]} */ (PAYABLE_STATUSES).includes(n.status)))
      throw conflict("not_payable", notPayable(n));
    if (input.amount !== n.amount) {
      throw validationError({
        amount: `The notice amount is Rs. ${n.amount?.toLocaleString("en-LK")}; a part payment can't be recorded.`,
      });
    }
    if (scan.type.kind !== "photo")
      throw validationError({ file: "The receipt scan must be a photo (JPEG, PNG or WebP)." });
    const ref = input.receiptNumber.trim().toUpperCase();
    if (await Payment.exists({ reference: ref })) {
      throw validationError({ receiptNumber: "This receipt number is already recorded." });
    }
    const now = new Date();
    const key = `receipts/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}${path.extname(`x.${scan.type.ext}`)}`;
    await storage.putFile(key, scan.tempPath, scan.type.mime);
    try {
      /** @type {any} */
      let created;
      await inTransaction(async (session) => {
        [created] = await Payment.create(
          [
            {
              channel: "receipt",
              method: input.method,
              status: "succeeded",
              reference: ref,
              noticeId: n._id,
              noticeNumber: n.noticeNumber,
              caseId: n.caseId,
              stationId: n.stationId,
              amount: input.amount,
              payerName: input.payerName ?? null,
              receivedAt: input.paidOn,
              recordedBy: { id: actor.userId, name: actor.name },
              receipt: {
                number: ref,
                paidOn: input.paidOn,
                scanKey: key,
                scanMime: scan.type.mime,
                scanSha256: scan.sha256,
              },
              history: [
                {
                  at: now,
                  event: "recorded",
                  by: actor.name,
                  note: `${input.method.replace("receipt_", "").replaceAll("_", " ")} receipt ${ref}`,
                },
              ],
            },
          ],
          { session },
        );
        const fresh = await Notice.findById(n._id, null, { session });
        if (fresh) await markNoticePaid(session, fresh, { reference: ref, by: actor.name });
        await recordAudit(
          {
            actor: { kind: "staff", id: actor.userId, name: actor.name, role: actor.role },
            action: "payments.receipt_recorded",
            summary: `Recorded receipt ${ref} for ${n.noticeNumber}: Rs. ${input.amount.toLocaleString("en-LK")}`,
            target: { type: "notice", id: String(n._id), label: n.noticeNumber },
            source: ctx,
            places: [actor, { stationId: n.stationId }],
          },
          session,
        );
      });
      return paymentView(created.toObject(), actor);
    } catch (err) {
      await storage.remove(key).catch(() => {});
      throw err;
    }
  } finally {
    await scan.cleanUp();
  }
}

/**
 * HQ reviews a recorded receipt (docs/07 §6) — never the person who
 * recorded it (S3). Reversed: the notice is unpaid again.
 * @param {Actor} actor @param {string} id @param {{ result: "confirmed" | "reversed", reason?: string }} input @param {RequestContext} ctx
 */
export async function reviewReceipt(actor, id, input, ctx) {
  const p = await loadVisible(actor, id);
  if (p.channel !== "receipt" || p.status !== "succeeded" || p.review) {
    throw conflict("wrong_state", "This receipt isn't waiting for review.");
  }
  if (String(p.recordedBy.id) === String(actor.userId)) {
    throw forbidden("You recorded this receipt; someone else reviews it (S3).");
  }
  await inTransaction(async (session) => {
    const now = new Date();
    p.review = {
      result: input.result,
      reason: input.reason ?? null,
      by: { id: actor.userId, name: actor.name },
      at: now,
    };
    if (input.result === "reversed") {
      p.status = "reversed";
      await unmarkNoticePaid(
        session,
        p.noticeId,
        actor.name,
        `Receipt ${p.reference} reversed: ${input.reason}`,
      );
    }
    p.history.push({
      at: now,
      event: `receipt_${input.result}`,
      by: actor.name,
      note: input.reason ?? null,
    });
    await p.save({ session });
    await recordAudit(
      {
        actor: { kind: "staff", id: actor.userId, name: actor.name, role: actor.role },
        action: `payments.receipt_${input.result}`,
        summary:
          input.result === "reversed"
            ? `Reversed receipt ${p.reference}: ${input.reason}`
            : `Confirmed receipt ${p.reference}`,
        target: { type: "notice", id: String(p.noticeId), label: p.noticeNumber },
        source: ctx,
        places: [actor, { stationId: p.stationId }],
      },
      session,
    );
  });
  return getPayment(actor, id);
}

/**
 * HQ approves a refund that is due (docs/07 §8, D07-3) — not the person
 * who caused it (S4: the one who withdrew the notice).
 * @param {Actor} actor @param {string} id @param {RequestContext} ctx
 */
export async function approveRefund(actor, id, ctx) {
  const p = await loadVisible(actor, id);
  if (p.refund?.status !== "due")
    throw conflict("wrong_state", "There is no refund due on this payment.");
  if (p.refund.preparedBy && p.refund.preparedBy === actor.name) {
    throw forbidden("You withdrew this notice; someone else approves the refund (S4).");
  }
  const r = simulatorRefund();
  await inTransaction(async (session) => {
    const now = new Date();
    const due = /** @type {NonNullable<typeof p.refund>} */ (p.refund);
    due.status = "refunded";
    due.approvedBy = { id: actor.userId, name: actor.name };
    due.refundedAt = now;
    due.reference = r.reference;
    p.history.push({ at: now, event: "refunded", by: actor.name, note: r.reference });
    await p.save({ session });
    await recordAudit(
      {
        actor: { kind: "staff", id: actor.userId, name: actor.name, role: actor.role },
        action: "payments.refunded",
        summary: `Refunded Rs. ${p.amount.toLocaleString("en-LK")} for ${p.noticeNumber} (${r.reference})`,
        target: { type: "notice", id: String(p.noticeId), label: p.noticeNumber },
        source: ctx,
        places: [actor, { stationId: p.stationId }],
      },
      session,
    );
  });
  return getPayment(actor, id);
}

// A paid notice withdrawn (HQ, override): its payment's refund is due.
onPaidNoticeWithdrawn(async (session, n, reason) => {
  const p = await Payment.findOne({ noticeId: n._id, status: "succeeded", refund: null }, null, {
    session,
  });
  if (!p) return;
  p.refund = {
    status: "due",
    reason,
    automatic: false,
    preparedBy: n.withdrawal?.by ?? null,
    dueAt: new Date(),
  };
  p.history.push({
    at: new Date(),
    event: "refund_due",
    by: n.withdrawal?.by ?? "System",
    note: reason,
  });
  await p.save({ session });
});

// ── Sweep ───────────────────────────────────────────────────────────────

/**
 * Bank delays (D07-4): confirmed once their minute is up. Payments left
 * pending for a day are marked failed (docs/07 §12).
 * @param {Date} [now]
 */
export async function runPaymentSweep(now = new Date()) {
  let confirmed = 0;
  for (const p of await Payment.find({ status: "pending", completeAfter: { $lte: now } })) {
    await sendConfirmation(p).catch(() => {});
    confirmed += 1;
  }
  const stale = await Payment.updateMany(
    { status: "pending", createdAt: { $lt: new Date(now.getTime() - STALE_MS) } },
    {
      $set: { status: "failed", failureReason: "timed_out" },
      $push: { history: { at: now, event: "timed_out", by: SIMULATOR.name } },
    },
  );
  return { confirmed, expired: stale.modifiedCount };
}

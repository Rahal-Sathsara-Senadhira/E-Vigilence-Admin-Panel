// Penalty notices and warning letters — docs/05 §5–§7.
//
//   decision approved ─► issued ─► (posted) served ─► due date
//        ├─ returned mail ─► service_failed ─► re-served at a new address
//        ├─ due date passed ─► overdue + reminder ─► final date ─► court proposed ─► OIC confirms
//        └─ HQ withdraws, with a reason
//
// A warning letter is delivered by posting it; the case then closes. Paying
// comes with N5; naming the driver and disputes with N4 slice 2.

import mongoose from "mongoose";
import { scopeOf } from "#src/core/access/permissions.js";
import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { nextNumber } from "#src/core/db/counters.js";
import { conflict, forbidden, notFound, validationError } from "#src/core/errors.js";
import { recordNumber } from "#src/core/srilanka.js";
import { Case, closeAfterOutcome, onCaseDecided, onDecisionOverridden } from "../cases/index.js";
import { Evidence } from "../evidence/index.js";
import { activeOffences } from "../offences/index.js";
import { Station } from "../organisation/organisation.model.js";
import { correctAddress, personById } from "../registers/index.js";
import { limitAt } from "../settings/settings.service.js";
import { OPEN_NOTICE_STATUSES, Notice, OutboxMessage } from "./notice.model.js";
import { noticeRowView, noticeView } from "./notices.views.js";
import { options as responseOptions } from "./responses.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */
/** @typedef {{ ip: string | null, userAgent: string | null }} RequestContext */
/** @typedef {import("./notice.model.js").NoticeDocument} NoticeDocument */

const SYSTEM = { kind: /** @type {const} */ ("system"), id: null, name: "Notice sweep" };
const escapeRegex = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The SMS that goes with a posted notice — never the offence or amount (docs/05 §5.1). @param {string} number */
const smsFor = (number, reminder = false) =>
  reminder
    ? `Sri Lanka Police: reminder — notice ${number} is overdue. Respond within 7 days to avoid court. Use the notice number and your vehicle number to respond.`
    : `Sri Lanka Police: notice ${number} has been posted to you. Use the notice number and your vehicle number to pay, name the driver or dispute it.`;

/** @param {NoticeDocument} n @param {string} event @param {string} by @param {string | null} [note] */
export function addEvent(n, event, by, note = null) {
  n.history.push({ at: new Date(), event, by, note });
}

// ── Issue (on decision) ─────────────────────────────────────────────────

/**
 * Issues the notice or warning letter for a decided case, in the decision's
 * transaction. Offences and fines are copied from the schedule now (D05-1).
 * @param {import("mongoose").ClientSession} session @param {any} c the case
 */
async function issueFor(session, c) {
  const outcome = c.decision?.outcome;
  if (!outcome || !["penalty_notice", "warning"].includes(outcome.outcome)) return;
  const person = outcome.addresseePerson
    ? await personById(outcome.addresseePerson.id, session)
    : null;
  if (!person?.address) throw conflict("no_address", "The addressee has no address recorded.");
  const offences = await activeOffences(outcome.offenceCodes);
  const penalty = outcome.outcome === "penalty_notice";
  const now = new Date();
  const noticeNumber = recordNumber(
    penalty ? "PN" : "WL",
    await nextNumber(penalty ? "notices" : "warnings", session),
  );
  const [n] = await Notice.create(
    [
      {
        noticeNumber,
        kind: penalty ? "penalty" : "warning",
        status: "issued",
        caseId: c._id,
        caseNumber: c.caseNumber,
        stationId: c.stationId,
        addressee: {
          personId: person._id,
          name: person.name,
          role: outcome.addressee,
          type: person.type,
          address: person.address,
          phone: person.phone ?? null,
        },
        vehicle: { plate: c.facts.vehicleNumber ?? null, description: c.facts.vehicleType ?? null },
        occurredAt: c.facts.occurredAt,
        place: c.facts.address ?? null,
        offences: offences.map((o) => ({
          code: o.code,
          name: o.name,
          legalReference: o.legalReference,
          fine: penalty ? (o.spotFine ?? null) : null,
        })),
        amount: penalty ? offences.reduce((sum, o) => sum + (o.spotFine ?? 0), 0) : null,
        issuedAt: now,
        issuedBy: c.decision.by.name,
        issuedById: c.decision.by.id,
        postBy: await limitAt("notices.post", now),
        history: [
          {
            at: now,
            event: "issued",
            by: c.decision.by.name,
            note: `From the decision on ${c.caseNumber}`,
          },
        ],
      },
    ],
    { session },
  );
  const notice = /** @type {NonNullable<typeof n>} */ (n);
  await queueLetter(session, notice, penalty ? "notice" : "warning");
  await recordAudit(
    {
      actor: { kind: "staff", id: c.decision.by.id, name: c.decision.by.name },
      action: penalty ? "notices.issued" : "notices.warning_issued",
      summary: penalty
        ? `Issued ${noticeNumber} for Rs. ${notice.amount?.toLocaleString("en-LK")} to ${person.name}`
        : `Issued warning letter ${noticeNumber} to ${person.name}`,
      target: { type: "notice", id: String(notice._id), label: noticeNumber },
      source: { ip: null, userAgent: null },
      places: [{ stationId: c.stationId }],
    },
    session,
  );
}

/** @param {import("mongoose").ClientSession} session @param {NoticeDocument} n @param {string} kind */
export async function queueLetter(session, n, kind) {
  await OutboxMessage.create(
    [
      {
        noticeId: n._id,
        noticeNumber: n.noticeNumber,
        stationId: n.stationId,
        channel: "post",
        kind,
        to: `${n.addressee.name}, ${n.addressee.address}`,
      },
    ],
    { session },
  );
}

/** @param {import("mongoose").ClientSession} session @param {NoticeDocument} n @param {boolean} reminder */
async function queueSms(session, n, reminder) {
  if (!n.addressee.phone) return;
  await OutboxMessage.create(
    [
      {
        noticeId: n._id,
        noticeNumber: n.noticeNumber,
        stationId: n.stationId,
        channel: "sms",
        kind: reminder ? "reminder" : "notice",
        to: n.addressee.phone,
        text: smsFor(n.noticeNumber, reminder),
      },
    ],
    { session },
  );
}

/**
 * Withdraws the case's running notices when HQ overrides the decision
 * (docs/05 §4). A paid one is refunded with N5.
 * @param {import("mongoose").ClientSession} session @param {any} c @param {string} by @param {string} reason
 */
async function withdrawForOverride(session, c, by, reason) {
  const running = await Notice.find(
    { caseId: c._id, status: { $in: [...OPEN_NOTICE_STATUSES, "paid"] } },
    null,
    { session },
  );
  for (const n of running) {
    const wasPaid = n.status === "paid";
    markWithdrawn(n, by, `Decision overridden: ${reason}`);
    await n.save({ session });
    await cancelQueued(session, n._id);
    if (wasPaid)
      for (const fn of paidWithdrawnListeners)
        await fn(session, n, `Decision overridden: ${reason}`);
  }
}

// ── Paying (docs/07) ────────────────────────────────────────────────────

/** Statuses a notice can be paid in (late payment until court, D05-6). */
export const PAYABLE_STATUSES = /** @type {const} */ ([
  "issued",
  "served",
  "service_failed",
  "nominated",
  "disputed",
  "overdue",
]);

/** @type {((session: import("mongoose").ClientSession, n: NoticeDocument, reason: string) => Promise<void>)[]} */
const paidWithdrawnListeners = [];
/**
 * Called when a paid notice is withdrawn, in the same transaction — the
 * payments module makes a refund due (docs/07 §8).
 * @param {(session: import("mongoose").ClientSession, n: NoticeDocument, reason: string) => Promise<void>} fn
 */
export function onPaidNoticeWithdrawn(fn) {
  paidWithdrawnListeners.push(fn);
}

/**
 * The notice is paid (docs/07 §5.3), in the payment's transaction: an open
 * dispute closes as withdrawn by payment (D07-6), a pending nomination is
 * set aside (payment wins, docs/05 §10), nothing more goes out but an SMS
 * receipt, and the case closes when nothing else is running.
 * @param {import("mongoose").ClientSession} session @param {NoticeDocument} n
 * @param {{ reference: string, by: string }} payment
 */
export async function markNoticePaid(session, n, payment) {
  const now = new Date();
  n.statusBeforePayment = n.status;
  if (n.status === "disputed" && n.dispute && !n.dispute.review) {
    n.dispute.review = {
      result: "withdrawn_by_payment",
      reasons: "Paid while the dispute was open",
      by: payment.by,
      at: now,
    };
  }
  if (n.status === "nominated" && n.nomination && !n.nomination.review) {
    n.nomination.review = {
      result: "ignored",
      reason: "Paid before the review",
      by: payment.by,
      at: now,
    };
  }
  n.status = "paid";
  n.paidAt = now;
  n.paymentReference = payment.reference;
  addEvent(n, "paid", payment.by, `Reference ${payment.reference}`);
  await n.save({ session });
  await cancelQueued(session, n._id);
  if (n.addressee.phone) {
    await OutboxMessage.create(
      [
        {
          noticeId: n._id,
          noticeNumber: n.noticeNumber,
          stationId: n.stationId,
          channel: "sms",
          kind: "receipt",
          to: n.addressee.phone,
          text: `Sri Lanka Police: payment received for notice ${n.noticeNumber}, reference ${payment.reference}. Thank you.`,
        },
      ],
      { session },
    );
  }
  const others = await Notice.countDocuments(
    { caseId: n.caseId, _id: { $ne: n._id }, status: { $in: OPEN_NOTICE_STATUSES } },
    { session },
  );
  if (!others)
    await closeAfterOutcome(session, n.caseId, payment.by, `Notice ${n.noticeNumber} paid`);
}

/**
 * A recorded receipt turned out wrong and was reversed (docs/07 §6): the
 * notice goes back to the status it was paid from. The case, if closed by
 * the payment, stays closed for HQ to reopen.
 * @param {import("mongoose").ClientSession} session @param {any} noticeId @param {string} by @param {string} reason
 */
export async function unmarkNoticePaid(session, noticeId, by, reason) {
  const n = await Notice.findById(noticeId, null, { session });
  if (!n || n.status !== "paid") return;
  n.status = /** @type {any} */ (n.statusBeforePayment ?? "served");
  n.paidAt = null;
  n.paymentReference = null;
  addEvent(n, "payment_reversed", by, reason);
  await n.save({ session });
}

/** @param {NoticeDocument} n @param {string} by @param {string} reason */
export function markWithdrawn(n, by, reason) {
  n.status = "withdrawn";
  n.withdrawal = { at: new Date(), by, reason };
  addEvent(n, "withdrawn", by, reason);
}

/** Nothing more goes out for a withdrawn notice. @param {import("mongoose").ClientSession} session @param {any} noticeId */
export const cancelQueued = (session, noticeId) =>
  OutboxMessage.updateMany(
    { noticeId, status: "queued" },
    { $set: { status: "cancelled" } },
    { session },
  );

onCaseDecided(issueFor);
onDecisionOverridden(withdrawForOverride);

// ── Scope ───────────────────────────────────────────────────────────────

/** Stations the user's scope covers for a permission, or null for all. @param {Actor} actor @param {string} permission */
async function stationsFor(actor, permission) {
  const scope = scopeOf(actor.role, permission);
  if (scope === "N" || scope === "R") return null;
  if (scope === "S" || scope === "A") return actor.stationId ? [String(actor.stationId)] : [];
  if (scope === "D")
    return (await Station.find({ divisionId: actor.divisionId }).distinct("_id")).map(String);
  return [];
}

/** @param {Actor} actor @param {string} id */
export async function loadVisible(actor, id) {
  if (!mongoose.isValidObjectId(id)) throw notFound("Notice not found.");
  const n = await Notice.findById(id);
  const stations = await stationsFor(actor, "notices.view");
  if (!n || (stations && !stations.includes(String(n.stationId))))
    throw notFound("Notice not found.");
  return n;
}

/** @param {Actor} actor @param {string} permission @param {any} stationId */
export async function reaches(actor, permission, stationId) {
  if (!scopeOf(actor.role, permission)) return false;
  const stations = await stationsFor(actor, permission);
  return stations === null || stations.includes(String(stationId));
}

/**
 * One audited change to a notice, in a transaction.
 * @param {Actor} actor @param {NoticeDocument} n @param {RequestContext} ctx @param {string} action
 * @param {(session: import("mongoose").ClientSession) => Promise<string>} apply
 */
export async function change(actor, n, ctx, action, apply) {
  await inTransaction(async (session) => {
    const summary = await apply(session);
    await n.save({ session });
    await recordAudit(
      {
        actor: { kind: "staff", id: actor.userId, name: actor.name, role: actor.role },
        action,
        summary,
        target: { type: "notice", id: String(n._id), label: n.noticeNumber },
        source: ctx,
        places: [actor, { stationId: n.stationId }],
      },
      session,
    );
  });
}

// ── Reading ─────────────────────────────────────────────────────────────

/** @param {Actor} actor @param {any} query */
export async function listNotices(actor, query) {
  const stations = await stationsFor(actor, "notices.view");
  /** @type {any[]} */
  const and = [
    stations ? { stationId: { $in: stations.map((s) => new mongoose.Types.ObjectId(s)) } } : {},
  ];
  /** @type {Record<string, any>} */
  const views = {
    to_post: { status: "issued" },
    service_failed: { status: "service_failed" },
    running: { status: { $in: ["served", "nominated", "disputed"] } },
    nominations: { status: "nominated" },
    disputes: { status: "disputed" },
    overdue: { status: "overdue", courtProposedAt: null },
    court_proposed: { status: "overdue", courtProposedAt: { $ne: null } },
    closed: { status: { $in: ["paid", "withdrawn", "transferred", "closed", "court_referral"] } },
    all: {},
  };
  and.push(views[query.view] ?? {});
  if (query.kind) and.push({ kind: query.kind });
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), "i");
    and.push({ $or: [{ noticeNumber: rx }, { caseNumber: rx }, { "vehicle.plate": rx }] });
  }
  const filter = { $and: and };
  const sort = [
    "to_post",
    "service_failed",
    "overdue",
    "court_proposed",
    "nominations",
    "disputes",
  ].includes(query.view)
    ? { createdAt: 1 }
    : { createdAt: -1 };
  const [rows, total] = await Promise.all([
    Notice.find(filter)
      .sort(/** @type {any} */ (sort))
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    Notice.countDocuments(filter),
  ]);
  const showPeople = Boolean(scopeOf(actor.role, "persons.view"));
  return {
    items: rows.map((n) => noticeRowView(n, showPeople)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** @param {Actor} actor @param {string} id */
export async function getNotice(actor, id) {
  const n = (await loadVisible(actor, id)).toObject();
  const [serve, withdraw, court, outbox, record, nomination, dispute] = await Promise.all([
    reaches(actor, "notices.serve", n.stationId),
    Promise.resolve(scopeOf(actor.role, "notices.withdraw") === "N"),
    reaches(actor, "court.confirmReferral", n.stationId),
    OutboxMessage.find({ noticeId: n._id }).sort({ createdAt: 1 }).lean(),
    reaches(actor, "notices.recordResponse", n.stationId),
    reaches(actor, "notices.reviewNomination", n.stationId),
    reaches(actor, "notices.reviewDispute", n.stationId),
  ]);
  const respond = responseOptions(n);
  // S8: not the officer who decided or served it.
  const involved = [
    n.issuedById,
    ...(n.service?.attempts ?? []).map((/** @type {any} */ a) => a.postedById),
  ]
    .filter(Boolean)
    .map(String);
  const open = /** @type {readonly string[]} */ (OPEN_NOTICE_STATUSES).includes(n.status);
  return noticeView(n, {
    showPeople: Boolean(scopeOf(actor.role, "persons.view")),
    outbox,
    can: {
      post: serve && n.status === "issued",
      serviceFailed: serve && n.status === "served" && n.kind === "penalty",
      reserve: serve && n.status === "service_failed",
      withdraw: withdraw && open,
      confirmCourt:
        court &&
        n.kind === "penalty" &&
        ((n.status === "overdue" && Boolean(n.courtProposedAt)) || n.status === "service_failed"),
      recordNomination: record && respond.nominate,
      recordDispute: record && respond.dispute,
      reviewNomination: nomination && n.status === "nominated",
      reviewDispute: dispute && n.status === "disputed" && !involved.includes(String(actor.userId)),
      disputeReviewBlocked:
        dispute && n.status === "disputed" && involved.includes(String(actor.userId)),
    },
  });
}

/**
 * What the printed notice shows (docs/05 §5.2) — no reporter details, ever.
 * @param {Actor} actor @param {string} id
 */
export async function noticeDocument(actor, id) {
  const n = await loadVisible(actor, id);
  const caseDoc = await Case.findById(n.caseId, { reportIds: 1 }).lean();
  const photos = await Evidence.find(
    {
      kind: "photo",
      $or: [{ caseId: n.caseId }, { reportId: { $in: caseDoc?.reportIds ?? [] } }],
    },
    { _id: 1 },
  )
    .limit(2)
    .lean();
  const station = n.stationId
    ? await Station.findById(n.stationId, { name: 1, address: 1, phone: 1 }).lean()
    : null;
  return {
    noticeNumber: n.noticeNumber,
    kind: n.kind,
    status: n.status,
    issuedAt: n.issuedAt.toISOString(),
    addressee: { name: n.addressee.name, address: n.addressee.address },
    vehicle: n.vehicle,
    occurredAt: n.occurredAt.toISOString(),
    place: n.place,
    offences: n.offences,
    amount: n.amount,
    servedAt: n.servedAt ? n.servedAt.toISOString() : null,
    dueDate: n.dueDate ? n.dueDate.toISOString() : null,
    station: station
      ? { name: station.name, address: station.address ?? null, phone: station.phone ?? null }
      : null,
    photoIds: photos.map((p) => String(p._id)),
  };
}

/** Letters and texts waiting to go out, oldest first. @param {Actor} actor @param {any} query */
export async function listOutbox(actor, query) {
  const stations = await stationsFor(actor, "notices.view");
  const filter = {
    status: query.status ?? "queued",
    ...(query.channel ? { channel: query.channel } : {}),
    ...(stations
      ? { stationId: { $in: stations.map((s) => new mongoose.Types.ObjectId(s)) } }
      : {}),
  };
  const rows = await OutboxMessage.find(filter).sort({ createdAt: 1 }).limit(200).lean();
  return {
    items: rows.map((m) => ({
      id: String(m._id),
      noticeId: String(m.noticeId),
      noticeNumber: m.noticeNumber,
      channel: m.channel,
      kind: m.kind,
      to: m.channel === "sms" ? m.to : (m.to.split(",")[0] ?? m.to),
      text: m.text ?? null,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

// ── Service ─────────────────────────────────────────────────────────────

/**
 * The station posted the letter (docs/05 §5.1): deemed served 3 days later;
 * the due date (14 days) counts from then. An SMS follows when a phone is
 * known. A warning letter is delivered by posting it, and the case closes.
 * @param {Actor} actor @param {string} id @param {{ postedAt?: Date }} input @param {RequestContext} ctx
 */
export async function markPosted(actor, id, input, ctx) {
  const n = await loadVisible(actor, id);
  if (!(await reaches(actor, "notices.serve", n.stationId))) throw forbidden();
  if (n.status !== "issued")
    throw conflict("wrong_state", "This notice isn't waiting to be posted.");
  const postedAt = input.postedAt ?? new Date();
  if (postedAt < n.issuedAt)
    throw validationError({ postedAt: "It can't be posted before it was issued." });
  const servedAt = await limitAt("notices.deemed_served", postedAt);
  const dueDate = await limitAt("notices.respond", servedAt);
  await change(actor, n, ctx, "notices.posted", async (session) => {
    n.service.attempts.push({
      postedAt,
      postedBy: actor.name,
      postedById: actor.userId,
      address: n.addressee.address,
      smsTo: n.kind === "penalty" ? n.addressee.phone : null,
    });
    n.service.reserveBy = null;
    await OutboxMessage.updateMany(
      { noticeId: n._id, channel: "post", status: "queued" },
      { $set: { status: "sent", sentAt: postedAt, sentBy: actor.name } },
      { session },
    );
    if (n.kind === "warning") {
      n.status = "closed";
      n.servedAt = servedAt;
      addEvent(n, "posted", actor.name, "Warning letter posted");
      await closeAfterOutcome(
        session,
        n.caseId,
        actor.name,
        `Warning letter ${n.noticeNumber} posted`,
      );
      return `Posted warning letter ${n.noticeNumber}; case closed`;
    }
    n.status = "served";
    n.servedAt = servedAt;
    n.dueDate = dueDate;
    await queueSms(session, n, false);
    addEvent(
      n,
      "posted",
      actor.name,
      `Deemed served ${servedAt.toISOString().slice(0, 10)}; due ${dueDate.toISOString().slice(0, 10)}`,
    );
    return `Posted ${n.noticeNumber} to ${n.addressee.address}`;
  });
  return getNotice(actor, id);
}

/**
 * Returned mail or an unknown address (docs/05 §5.1): time stops; the
 * station finds a new address and re-serves, or the OIC sends it to court.
 * @param {Actor} actor @param {string} id @param {string} note @param {RequestContext} ctx
 */
export async function markServiceFailed(actor, id, note, ctx) {
  const n = await loadVisible(actor, id);
  if (!(await reaches(actor, "notices.serve", n.stationId))) throw forbidden();
  if (n.status !== "served" || n.kind !== "penalty")
    throw conflict("wrong_state", "Only a served notice can fail service.");
  const reserveBy = await limitAt("notices.reserve", new Date());
  await change(actor, n, ctx, "notices.service_failed", async () => {
    const last = n.service.attempts.at(-1);
    if (last) {
      last.result = "returned";
      last.note = note;
    }
    n.status = "service_failed";
    n.servedAt = null;
    n.dueDate = null;
    n.service.reserveBy = reserveBy;
    addEvent(n, "service_failed", actor.name, note);
    return `Service failed: ${note}`;
  });
  return getNotice(actor, id);
}

/**
 * Serve again at a new address; the person's record is corrected too (V5).
 * @param {Actor} actor @param {string} id @param {{ address: string, reason: string }} input @param {RequestContext} ctx
 */
export async function reserveNotice(actor, id, input, ctx) {
  const n = await loadVisible(actor, id);
  if (!(await reaches(actor, "notices.serve", n.stationId))) throw forbidden();
  if (n.status !== "service_failed")
    throw conflict("wrong_state", "This notice isn't waiting to be re-served.");
  await change(actor, n, ctx, "notices.reserve_prepared", async (session) => {
    n.addressee.address = input.address;
    n.status = "issued";
    n.postBy = await limitAt("notices.post", new Date());
    await correctAddress(session, n.addressee.personId, input.address, actor.name, input.reason);
    await queueLetter(session, n, "notice");
    addEvent(n, "readdressed", actor.name, `New address: ${input.address} — ${input.reason}`);
    return `New address for ${n.noticeNumber}; to be posted again`;
  });
  return getNotice(actor, id);
}

// ── HQ and the OIC ──────────────────────────────────────────────────────

/**
 * HQ withdraws a running notice, with a reason (docs/05 §6). The case's
 * outcome ends with it.
 * @param {Actor} actor @param {string} id @param {string} reason @param {RequestContext} ctx
 */
export async function withdrawNotice(actor, id, reason, ctx) {
  const n = await loadVisible(actor, id);
  if (scopeOf(actor.role, "notices.withdraw") !== "N") throw forbidden();
  if (!(
    /** @type {readonly string[]} */ (OPEN_NOTICE_STATUSES).includes(n.status) ||
    n.status === "paid"
  )) {
    throw conflict("wrong_state", "This notice has already ended.");
  }
  await change(actor, n, ctx, "notices.withdrawn", async (session) => {
    const wasPaid = n.status === "paid";
    markWithdrawn(n, actor.name, reason);
    await cancelQueued(session, n._id);
    if (wasPaid) for (const fn of paidWithdrawnListeners) await fn(session, n, reason);
    const others = await Notice.countDocuments(
      { caseId: n.caseId, _id: { $ne: n._id }, status: { $in: OPEN_NOTICE_STATUSES } },
      { session },
    );
    if (!others)
      await closeAfterOutcome(
        session,
        n.caseId,
        actor.name,
        `Notice ${n.noticeNumber} withdrawn: ${reason}`,
      );
    return `Withdrew ${n.noticeNumber}: ${reason}`;
  });
  return getNotice(actor, id);
}

/**
 * The OIC confirms the court referral the system proposed (D05-8) — or
 * sends an unservable notice to court.
 * @param {Actor} actor @param {string} id @param {string} note @param {RequestContext} ctx
 */
export async function confirmCourt(actor, id, note, ctx) {
  const n = await loadVisible(actor, id);
  if (!(await reaches(actor, "court.confirmReferral", n.stationId))) throw forbidden();
  const proposed = n.status === "overdue" && n.courtProposedAt;
  if (!(proposed || n.status === "service_failed") || n.kind !== "penalty") {
    throw conflict("wrong_state", "There is no court referral to confirm for this notice.");
  }
  await change(actor, n, ctx, "notices.court_referral", async (session) => {
    n.status = "court_referral";
    n.courtConfirmedBy = actor.name;
    await cancelQueued(session, n._id);
    addEvent(n, "court_referral", actor.name, note);
    return `Referred ${n.noticeNumber} to court: ${note}`;
  });
  return getNotice(actor, id);
}

// ── Sweep ───────────────────────────────────────────────────────────────

/**
 * Due dates (docs/05 §6.4): a served notice past its due date becomes
 * overdue, with a reminder (post + SMS) and 7 more days; after that the
 * system proposes court for the OIC to confirm. Run regularly by the server.
 * @param {Date} [now]
 */
export async function runNoticeSweep(now = new Date()) {
  let reminded = 0;
  let proposed = 0;
  for (const { _id } of await Notice.find(
    { status: "served", dueDate: { $lt: now } },
    { _id: 1 },
  ).lean()) {
    await inTransaction(async (session) => {
      const n = await Notice.findOne({ _id, status: "served", dueDate: { $lt: now } }, null, {
        session,
      });
      if (!n) return;
      n.status = "overdue";
      if (n.reminderSentAt) {
        // Already reminded (a rejected dispute's 7 days ran out): straight to the court proposal.
        n.finalDueDate = now;
        addEvent(n, "overdue", SYSTEM.name, "No payment after the rejected dispute");
        await n.save({ session });
        return;
      }
      n.reminderSentAt = now;
      n.finalDueDate = await limitAt("notices.final_after_reminder", now);
      await queueLetter(session, n, "reminder");
      await queueSms(session, n, true);
      addEvent(
        n,
        "overdue",
        SYSTEM.name,
        `Reminder sent; final date ${n.finalDueDate.toISOString().slice(0, 10)}`,
      );
      await n.save({ session });
      await recordAudit(
        {
          actor: SYSTEM,
          action: "notices.overdue",
          summary: `${n.noticeNumber} overdue: reminder sent`,
          target: { type: "notice", id: String(n._id), label: n.noticeNumber },
          source: { ip: null, userAgent: "notice-sweep" },
          places: [{ stationId: n.stationId }],
        },
        session,
      );
      reminded += 1;
    });
  }
  for (const { _id } of await Notice.find(
    { status: "overdue", finalDueDate: { $lt: now }, courtProposedAt: null },
    { _id: 1 },
  ).lean()) {
    await inTransaction(async (session) => {
      const n = await Notice.findOne({ _id, status: "overdue", courtProposedAt: null }, null, {
        session,
      });
      if (!n) return;
      n.courtProposedAt = now;
      addEvent(
        n,
        "court_proposed",
        SYSTEM.name,
        "No response after the reminder: court referral proposed to the OIC",
      );
      await n.save({ session });
      await recordAudit(
        {
          actor: SYSTEM,
          action: "notices.court_proposed",
          summary: `${n.noticeNumber}: court referral proposed`,
          target: { type: "notice", id: String(n._id), label: n.noticeNumber },
          source: { ip: null, userAgent: "notice-sweep" },
          places: [{ stationId: n.stationId }],
        },
        session,
      );
      proposed += 1;
    });
  }
  return { reminded, proposed };
}

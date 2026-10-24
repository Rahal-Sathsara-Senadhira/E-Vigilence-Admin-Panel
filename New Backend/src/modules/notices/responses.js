// What the addressee can do — docs/05 §6.2, §6.3: name the driver (the
// owner, once, before the due date) or dispute (once). Either online, with
// the notice number and the vehicle's plate, or at the station, recorded by
// staff. The station reviews: an accepted nomination reissues the notice to
// the driver; an upheld dispute withdraws it and the case is decided again.

import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { nextNumber } from "#src/core/db/counters.js";
import { conflict, forbidden, notFound, validationError } from "#src/core/errors.js";
import { normalizeNic, normalizePhone, normalizePlate, recordNumber } from "#src/core/srilanka.js";
import { reconsiderAfterDispute, recordNamedDriver } from "../cases/index.js";
import { Station } from "../organisation/organisation.model.js";
import { findOrAddPerson, personById } from "../registers/index.js";
import { limitAt } from "../settings/settings.service.js";
import { Notice } from "./notice.model.js";
import {
  addEvent,
  cancelQueued,
  change,
  getNotice,
  loadVisible,
  markWithdrawn,
  queueLetter,
  PAYABLE_STATUSES,
  reaches,
} from "./notices.service.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */
/** @typedef {{ ip: string | null, userAgent: string | null }} RequestContext */
/** @typedef {import("./notice.model.js").NoticeDocument} NoticeDocument */

export const DISPUTE_GROUNDS = /** @type {const} */ ([
  "not_my_vehicle",
  "sold_or_stolen",
  "evidence_wrong",
  "other",
]);

const ONLINE = { kind: /** @type {const} */ ("anonymous"), id: null, name: "Addressee (online)" };

/**
 * What the addressee may still do, and why not.
 * @param {any} n @param {Date} [now]
 */
export function options(n, now = new Date()) {
  const penalty = n.kind === "penalty";
  const nominate =
    penalty &&
    n.addressee.role === "owner" &&
    n.status === "served" &&
    !n.nomination &&
    Boolean(n.dueDate && n.dueDate >= now);
  const dispute =
    penalty &&
    !n.dispute &&
    (n.status === "served" || (n.status === "overdue" && !n.courtProposedAt));
  return { nominate, dispute };
}

// ── Recording (online or at the station) ────────────────────────────────

/**
 * @param {any} input @returns {{ name: string, nic: string | null, licenceNumber: string | null, address: string, phone: string | null }}
 */
function driverOf(input) {
  const nic = input.nic ? normalizeNic(input.nic) : null;
  if (input.nic && !nic)
    throw validationError({ nic: "Enter a valid NIC: 9 digits and V or X, or 12 digits." });
  const licenceNumber = input.licenceNumber
    ? String(input.licenceNumber).trim().toUpperCase()
    : null;
  if (!nic && !licenceNumber) {
    throw validationError({ nic: "Give the driver's NIC or driving licence number." });
  }
  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (input.phone && !phone) throw validationError({ phone: "Enter a Sri Lankan phone number." });
  return { name: input.name.trim(), nic, licenceNumber, address: input.address.trim(), phone };
}

/**
 * @param {NoticeDocument} n @param {any} input @param {"online" | "station"} via @param {string | null} recordedBy
 */
function applyNomination(n, input, via, recordedBy) {
  if (!options(n).nominate) {
    throw conflict(
      "not_allowed",
      n.addressee.role !== "owner"
        ? "A named driver can't name someone else. They can pay or dispute."
        : n.nomination
          ? "The driver has already been named for this notice."
          : "The driver can be named only while the notice is served and before its due date.",
    );
  }
  n.nomination = {
    at: new Date(),
    via,
    recordedBy,
    driver: driverOf(input.driver),
    statement: input.statement ?? null,
    review: null,
    childNoticeId: null,
  };
  n.status = "nominated";
  addEvent(
    n,
    "nominated",
    recordedBy ?? "Addressee (online)",
    `Driver named: ${input.driver.name}`,
  );
}

/**
 * @param {NoticeDocument} n @param {any} input @param {"online" | "station"} via @param {string | null} recordedBy
 */
async function applyDispute(n, input, via, recordedBy) {
  if (!options(n).dispute) {
    throw conflict(
      "not_allowed",
      n.dispute
        ? "This notice has already been disputed once. The next step is court."
        : "This notice can't be disputed now.",
    );
  }
  n.dispute = {
    at: new Date(),
    via,
    recordedBy,
    grounds: input.grounds,
    explanation: input.explanation,
    fromStatus: n.status,
    reviewBy: await limitAt("notices.dispute_review", new Date()),
    review: null,
  };
  n.status = "disputed";
  addEvent(
    n,
    "disputed",
    recordedBy ?? "Addressee (online)",
    `${input.grounds.replaceAll("_", " ")}: ${input.explanation}`,
  );
}

/**
 * Station staff record a nomination or dispute received at the counter or
 * by post.
 * @param {Actor} actor @param {string} id @param {any} input @param {RequestContext} ctx
 */
export async function recordResponse(actor, id, input, ctx) {
  const n = await loadVisible(actor, id);
  if (!(await reaches(actor, "notices.recordResponse", n.stationId))) throw forbidden();
  if (input.type === "nomination") {
    await change(actor, n, ctx, "notices.nominated", async () => {
      applyNomination(n, input, "station", actor.name);
      return `Recorded the owner's nomination of ${input.driver.name}`;
    });
  } else {
    await change(actor, n, ctx, "notices.disputed", async () => {
      await applyDispute(n, input, "station", actor.name);
      return `Recorded a dispute: ${input.grounds.replaceAll("_", " ")}`;
    });
  }
  return getNotice(actor, id);
}

// ── Reviews ─────────────────────────────────────────────────────────────

/**
 * The station reviews the named driver (docs/05 §6.2). Accepted: the
 * driver is found in the register (or added), the owner's notice is
 * transferred, and a new notice goes to the driver with a fresh due date.
 * Rejected (can't be identified): the owner's notice continues.
 * @param {Actor} actor @param {string} id
 * @param {{ result: "accepted" | "rejected", reason?: string, personId?: string }} input @param {RequestContext} ctx
 */
export async function reviewNomination(actor, id, input, ctx) {
  const n = await loadVisible(actor, id);
  if (!(await reaches(actor, "notices.reviewNomination", n.stationId))) throw forbidden();
  if (n.status !== "nominated" || !n.nomination)
    throw conflict("wrong_state", "There is no named driver to review.");
  const nomination = n.nomination;
  if (input.result === "rejected") {
    await change(actor, n, ctx, "notices.nomination_rejected", async () => {
      nomination.review = {
        result: "rejected",
        reason: input.reason ?? null,
        by: actor.name,
        at: new Date(),
      };
      n.status = "served";
      addEvent(n, "nomination_rejected", actor.name, input.reason ?? null);
      return `Nomination rejected: ${input.reason}`;
    });
    return getNotice(actor, id);
  }
  /** @type {any} */
  let child;
  await change(actor, n, ctx, "notices.transferred", async (session) => {
    const person = input.personId
      ? await personById(input.personId, session)
      : await findOrAddPerson(session, nomination.driver, actor.name);
    if (!person) throw validationError({ personId: "Choose a person from the register." });
    const address = person.address ?? nomination.driver.address;
    const now = new Date();
    const noticeNumber = recordNumber("PN", await nextNumber("notices", session));
    [child] = await Notice.create(
      [
        {
          noticeNumber,
          kind: "penalty",
          status: "issued",
          caseId: n.caseId,
          caseNumber: n.caseNumber,
          stationId: n.stationId,
          addressee: {
            personId: person._id,
            name: person.name,
            role: "driver",
            type: "individual",
            address,
            phone: person.phone ?? nomination.driver.phone ?? null,
          },
          vehicle: n.vehicle,
          occurredAt: n.occurredAt,
          place: n.place,
          offences: n.offences,
          amount: n.amount,
          issuedAt: now,
          issuedBy: actor.name,
          issuedById: n.issuedById,
          postBy: await limitAt("notices.post", now),
          parentNoticeId: n._id,
          history: [
            {
              at: now,
              event: "issued",
              by: actor.name,
              note: `Reissued to the driver named on ${n.noticeNumber}`,
            },
          ],
        },
      ],
      { session },
    );
    await queueLetter(session, child, "notice");
    nomination.review = {
      result: "accepted",
      reason: input.reason ?? null,
      by: actor.name,
      at: now,
    };
    nomination.childNoticeId = child._id;
    n.status = "transferred";
    await cancelQueued(session, n._id);
    addEvent(n, "transferred", actor.name, `Reissued to ${person.name} as ${noticeNumber}`);
    await recordNamedDriver(session, n.caseId, person, actor.name);
    return `Driver ${person.name} accepted; ${n.noticeNumber} transferred to ${noticeNumber}`;
  });
  return getNotice(actor, String(child._id));
}

/**
 * The dispute review (docs/05 §6.3) — by someone other than the officer who
 * decided or served the notice (S8). Upheld: the notice is withdrawn and the
 * case is decided again. Rejected: back to served with 7 more days.
 * @param {Actor} actor @param {string} id
 * @param {{ result: "upheld" | "rejected", reasons: string }} input @param {RequestContext} ctx
 */
export async function reviewDispute(actor, id, input, ctx) {
  const n = await loadVisible(actor, id);
  if (!(await reaches(actor, "notices.reviewDispute", n.stationId))) throw forbidden();
  if (n.status !== "disputed" || !n.dispute)
    throw conflict("wrong_state", "There is no dispute to review.");
  const involved = [n.issuedById, ...n.service.attempts.map((a) => a.postedById)]
    .filter(Boolean)
    .map(String);
  if (involved.includes(String(actor.userId))) {
    throw forbidden("You decided or served this notice; someone else reviews the dispute (S8).");
  }
  const dispute = n.dispute;
  const dueDate =
    input.result === "rejected" ? await limitAt("notices.after_dispute", new Date()) : null;
  await change(actor, n, ctx, `notices.dispute_${input.result}`, async (session) => {
    dispute.review = {
      result: input.result,
      reasons: input.reasons,
      by: actor.name,
      at: new Date(),
    };
    if (input.result === "upheld") {
      markWithdrawn(n, actor.name, `Dispute upheld: ${input.reasons}`);
      await cancelQueued(session, n._id);
      await reconsiderAfterDispute(session, n.caseId, actor.name, input.reasons);
      return `Dispute upheld; ${n.noticeNumber} withdrawn and the case sent back for a new decision`;
    }
    n.status = "served";
    n.dueDate = dueDate;
    n.courtProposedAt = null;
    addEvent(n, "dispute_rejected", actor.name, input.reasons);
    return `Dispute rejected: ${input.reasons}`;
  });
  return getNotice(actor, id);
}

// ── Online (no sign-in) ─────────────────────────────────────────────────

/** "Ruwan Jayasinghe" → "R. J*********" — enough to recognise, not to learn. @param {string} name */
const maskName = (name) => {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1) ?? "") : "";
  return last
    ? `${first}. ${last[0]}${"*".repeat(Math.max(last.length - 1, 3))}`
    : `${first}${"*".repeat(4)}`;
};

/**
 * The notice with this number for this vehicle — both must match. The same
 * answer for "no such notice" and "wrong plate", so neither can be probed.
 * @param {{ noticeNumber: string, plate: string }} input
 */
async function findByNumberAndPlate(input) {
  const plate = normalizePlate(input.plate);
  const n = plate
    ? await Notice.findOne({
        noticeNumber: input.noticeNumber.trim().toUpperCase(),
        "vehicle.plate": plate,
        kind: "penalty",
      })
    : null;
  if (!n)
    throw notFound("No notice matches that number and vehicle number. Check both and try again.");
  return n;
}

/** What the addressee sees online — no address, a masked name. @param {any} n */
async function publicView(n) {
  const station = n.stationId
    ? await Station.findById(n.stationId, { name: 1, phone: 1 }).lean()
    : null;
  const can = options(n);
  return {
    noticeNumber: n.noticeNumber,
    status: n.status,
    addressee: { name: maskName(n.addressee.name), role: n.addressee.role },
    vehicle: n.vehicle?.plate ?? null,
    occurredAt: n.occurredAt.toISOString(),
    place: n.place ?? null,
    offences: n.offences.map((/** @type {any} */ o) => ({
      name: o.name,
      legalReference: o.legalReference,
      fine: o.fine,
    })),
    amount: n.amount,
    servedAt: n.servedAt ? n.servedAt.toISOString() : null,
    dueDate: n.dueDate ? n.dueDate.toISOString() : null,
    finalDueDate: n.finalDueDate ? n.finalDueDate.toISOString() : null,
    nomination: n.nomination
      ? { at: n.nomination.at.toISOString(), result: n.nomination.review?.result ?? null }
      : null,
    dispute: n.dispute
      ? {
          at: n.dispute.at.toISOString(),
          result: n.dispute.review?.result ?? null,
          reasons: n.dispute.review?.reasons ?? null,
        }
      : null,
    station: station ? { name: station.name, phone: station.phone ?? null } : null,
    can: {
      ...can,
      pay:
        n.kind === "penalty" &&
        /** @type {readonly string[]} */ (PAYABLE_STATUSES).includes(n.status),
    },
  };
}

/** @param {{ noticeNumber: string, plate: string }} input */
export async function publicLookup(input) {
  return publicView(await findByNumberAndPlate(input));
}

/**
 * One online response, audited as the addressee.
 * @param {any} input @param {RequestContext} ctx @param {"nomination" | "dispute"} type
 */
export async function publicRespond(input, ctx, type) {
  const n = await findByNumberAndPlate(input);
  await inTransaction(async (session) => {
    if (type === "nomination") applyNomination(n, input, "online", null);
    else await applyDispute(n, input, "online", null);
    await n.save({ session });
    await recordAudit(
      {
        actor: ONLINE,
        action: type === "nomination" ? "notices.nominated" : "notices.disputed",
        summary:
          type === "nomination"
            ? "The owner named the driver online"
            : `Disputed online: ${input.grounds}`,
        target: { type: "notice", id: String(n._id), label: n.noticeNumber },
        source: ctx,
        places: [{ stationId: n.stationId }],
      },
      session,
    );
  });
  return publicView(n);
}

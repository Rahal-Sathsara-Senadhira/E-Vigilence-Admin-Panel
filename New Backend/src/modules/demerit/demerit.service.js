// Demerit points — docs/08. Off until HQ turns the scheme on; from then,
// points are recorded when an outcome becomes final (a notice paid, a
// conviction confirmed) and removed when it is undone (refund, reversal,
// acquittal on appeal). Each person's total counts entries not yet expired;
// crossing a threshold flags them and tells the station or HQ. The system
// never suspends a licence (D08-6).

import mongoose from "mongoose";
import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { conflict, notFound } from "#src/core/errors.js";
import { Case } from "../cases/index.js";
import { CourtCase } from "../court/court.model.js";
import { Notice } from "../notices/index.js";
import { notify } from "../notifications/index.js";
import { OffenceVersion } from "../offences/offences.model.js";
import { mayOpenPerson } from "../registers/index.js";
import { Person } from "../registers/registers.model.js";
import { DemeritEntry, DemeritSetting, DemeritStanding } from "./demerit.model.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */
/** @typedef {import("mongoose").ClientSession} Session */
/** @typedef {{ ip?: string | null, userAgent?: string | null }} RequestContext */

/** Off by default (§2); thresholds per D08-5, to be confirmed. */
export const DEFAULTS = Object.freeze({ enabled: false, warnAt: 16, referAt: 24 });
/** D08-4. */
const EXPIRY_MONTHS = 24;

// ── The switch (§2) ─────────────────────────────────────────────────────

/** The settings in force at a moment. @param {Date} [at] @param {Session} [session] */
export async function settingsAt(at = new Date(), session) {
  const v = await DemeritSetting.findOne({ effectiveFrom: { $lte: at } }, null, { session })
    .sort({ effectiveFrom: -1 })
    .lean();
  return v ? { enabled: v.enabled, warnAt: v.warnAt, referAt: v.referAt } : { ...DEFAULTS };
}

export async function listSettings() {
  const history = await DemeritSetting.find().sort({ effectiveFrom: -1 }).limit(50).lean();
  return {
    current: await settingsAt(),
    history: history.map((h) => ({
      effectiveFrom: h.effectiveFrom.toISOString(),
      enabled: h.enabled,
      warnAt: h.warnAt,
      referAt: h.referAt,
      changedBy: h.changedBy,
      reason: h.reason,
    })),
  };
}

/**
 * A new version of the settings, in force from now (D08-1). Turning the
 * scheme off keeps the points already recorded; they expire normally (§9).
 * @param {Actor} actor @param {{ enabled: boolean, warnAt: number, referAt: number, reason: string }} input @param {RequestContext} ctx
 */
export async function setSettings(actor, input, ctx) {
  const now = await settingsAt();
  if (now.enabled === input.enabled && now.warnAt === input.warnAt && now.referAt === input.referAt)
    throw conflict("unchanged", "These settings are in force already.");
  await inTransaction(async (session) => {
    await DemeritSetting.create(
      [
        {
          effectiveFrom: new Date(),
          enabled: input.enabled,
          warnAt: input.warnAt,
          referAt: input.referAt,
          changedBy: actor.name,
          changedById: actor.userId,
          reason: input.reason,
        },
      ],
      { session },
    );
    await recordAudit(
      {
        actor: { kind: "staff", id: actor.userId, name: actor.name, role: actor.role },
        action: "demerit.settings_changed",
        summary: `Demerit points ${input.enabled ? "on" : "off"}, warning at ${input.warnAt}, referral at ${input.referAt}: ${input.reason}`,
        target: { type: "demerit_settings", id: "current", label: "Demerit points" },
        source: ctx,
      },
      session,
    );
  });
  return listSettings();
}

// ── The ledger (§4–§6) ──────────────────────────────────────────────────

/** The sum of the offences' points (D08-2). @param {string[]} codes @param {Session} session */
async function pointsFor(codes, session) {
  const rows = await OffenceVersion.find(
    { code: { $in: codes }, current: true },
    { demeritPoints: 1 },
    { session },
  ).lean();
  return rows.reduce((s, o) => s + (o.demeritPoints ?? 0), 0);
}

/** @param {Date} offenceDate */
function expiryOf(offenceDate) {
  const d = new Date(offenceDate);
  d.setMonth(d.getMonth() + EXPIRY_MONTHS);
  return d;
}

/** Points recorded and not removed for an outcome. @param {any} sourceId @param {Session} session */
async function netFor(sourceId, session) {
  const rows = await DemeritEntry.find(
    { "source.id": sourceId },
    { points: 1 },
    { session },
  ).lean();
  return rows.reduce((s, e) => s + e.points, 0);
}

/**
 * A notice was paid: its points go to the addressee — the driver named or
 * identified, or the owner who paid without naming one (D08-3). An
 * organisation has no licence: no points, and HQ is told (§5).
 * @param {Session} session @param {any} noticeId @param {string} by
 */
export async function recordForNotice(session, noticeId, by) {
  if (!(await settingsAt(new Date(), session)).enabled) return null;
  const n = await Notice.findById(noticeId, null, { session }).lean();
  if (!n || n.kind !== "penalty" || n.status !== "paid") return null;
  if ((await netFor(n._id, session)) > 0) return null;
  if (n.addressee.type === "organisation") {
    await notify(session, [{ national: ["hq_supervisor"] }], {
      kind: "demerit.organisation_paid",
      level: "warning",
      title: `${n.noticeNumber} paid by an organisation without naming a driver`,
      body: "Organisations must name the driver (docs/05 D05-7). No points were recorded.",
      link: `/notices/${n._id}`,
    });
    return null;
  }
  const codes = n.offences.map((o) => o.code);
  const points = await pointsFor(codes, session);
  if (points <= 0) return null;
  return record(session, {
    personId: n.addressee.personId,
    points,
    offenceCodes: codes,
    caseId: n.caseId,
    caseNumber: n.caseNumber,
    source: { type: "notice", id: n._id, number: n.noticeNumber },
    offenceDate: n.occurredAt,
    recordedBy: by,
    stationId: n.stationId,
  });
}

/**
 * A conviction was confirmed (or upheld on appeal): points go to the accused.
 * @param {Session} session @param {any} courtCaseId @param {string} by
 */
export async function recordForCourtCase(session, courtCaseId, by) {
  if (!(await settingsAt(new Date(), session)).enabled) return null;
  const cc = await CourtCase.findById(courtCaseId, null, { session }).lean();
  if (!cc?.accused?.personId) return null;
  if ((await netFor(cc._id, session)) > 0) return null;
  const person = await Person.findById(cc.accused.personId, { type: 1 }, { session }).lean();
  if (person?.type === "organisation") return null;
  const codes = cc.charges.map((c) => String(c.code));
  const points = await pointsFor(codes, session);
  if (points <= 0) return null;
  const c = await Case.findById(cc.caseId, { "facts.occurredAt": 1 }, { session }).lean();
  return record(session, {
    personId: cc.accused.personId,
    points,
    offenceCodes: codes,
    caseId: cc.caseId,
    caseNumber: cc.caseNumber,
    source: { type: "court_case", id: cc._id, number: cc.courtRef },
    offenceDate: c?.facts.occurredAt ?? cc.createdAt,
    recordedBy: by,
    stationId: cc.stationId,
  });
}

/**
 * @param {Session} session
 * @param {{ personId: any, points: number, offenceCodes: string[], caseId: any, caseNumber: string,
 *   source: { type: string, id: any, number: string }, offenceDate: Date, recordedBy: string, stationId: any }} e
 */
async function record(session, e) {
  const { stationId, ...fields } = e;
  const [entry] = await DemeritEntry.create(
    /** @type {any[]} */ ([{ ...fields, expiresAt: expiryOf(e.offenceDate) }]),
    { session },
  );
  await refreshStanding(session, e.personId, stationId);
  return entry;
}

/**
 * The outcome was undone (refund, receipt reversed, acquittal on appeal):
 * a negative entry cancels what was recorded for it (§4).
 * @param {Session} session @param {any} sourceId @param {string} why @param {string} by
 */
export async function removeFor(session, sourceId, why, by) {
  const entries = await DemeritEntry.find({ "source.id": sourceId }, null, { session }).lean();
  const net = entries.reduce((s, e) => s + e.points, 0);
  const first = entries.find((e) => e.points > 0);
  if (net <= 0 || !first) return null;
  const [entry] = await DemeritEntry.create(
    /** @type {any[]} */ ([
      {
        personId: first.personId,
        points: -net,
        offenceCodes: first.offenceCodes,
        caseId: first.caseId,
        caseNumber: first.caseNumber,
        source: first.source,
        offenceDate: first.offenceDate,
        expiresAt: first.expiresAt,
        recordedBy: by,
        reason: why,
        cancels: first._id,
      },
    ]),
    { session },
  );
  await refreshStanding(session, first.personId, null);
  return entry;
}

// ── Standing and thresholds (§7) ────────────────────────────────────────

const RANK = { none: 0, approaching: 1, threshold: 2 };

/**
 * Recounts a person's current total, sets the flag, and tells whoever acts
 * when a threshold is newly crossed: the station sends the warning letter;
 * HQ refers the driver to the Department of Motor Traffic.
 * @param {Session} session @param {any} personId @param {any} stationId the station of the outcome, if any
 */
export async function refreshStanding(session, personId, stationId) {
  const now = new Date();
  // One at a time: a transaction's session runs one operation at once.
  const rows = await DemeritEntry.aggregate([
    {
      $match: {
        personId: new mongoose.Types.ObjectId(String(personId)),
        expiresAt: { $gt: now },
      },
    },
    { $group: { _id: null, total: { $sum: "$points" } } },
  ]).session(session);
  const settings = await settingsAt(now, session);
  const before = await DemeritStanding.findOne({ personId }, null, { session }).lean();
  const person = await Person.findById(personId, { name: 1 }, { session }).lean();
  const total = Math.max(0, rows[0]?.total ?? 0);
  const flag =
    total >= settings.referAt ? "threshold" : total >= settings.warnAt ? "approaching" : "none";
  const old = /** @type {keyof typeof RANK} */ (before?.flag ?? "none");
  await DemeritStanding.updateOne(
    { personId },
    {
      $set: {
        total,
        flag,
        ...(flag !== old ? { flaggedAt: flag === "none" ? null : now } : {}),
      },
    },
    { session, upsert: true },
  );
  if (RANK[flag] > RANK[old] && person) {
    const link = `/persons/${personId}`;
    if (flag === "approaching" && stationId) {
      await notify(session, [{ station: stationId, roles: ["station_oic"] }], {
        kind: "demerit.approaching",
        level: "warning",
        title: `${person.name}: ${total} demerit points — send the warning letter`,
        body: `Approaching the suspension threshold of ${settings.referAt}.`,
        link,
      });
    }
    if (flag === "threshold") {
      await notify(session, [{ national: ["hq_supervisor"] }], {
        kind: "demerit.threshold",
        level: "danger",
        title: `${person.name}: ${total} demerit points — refer to the DMT`,
        body: "The suspension threshold is reached. Record the referral to the Department of Motor Traffic.",
        link,
      });
    }
  }
  return { total, flag };
}

/**
 * Points expire 24 months after the offence (D08-4): recount everyone whose
 * total may have dropped. Run daily by the server.
 */
export async function runDemeritSweep() {
  const people = await DemeritStanding.find({ total: { $gt: 0 } }, { personId: 1 }).lean();
  let changed = 0;
  for (const { personId } of people) {
    const before = await DemeritStanding.findOne({ personId }, { total: 1 }).lean();
    const after = await inTransaction((session) => refreshStanding(session, personId, null));
    if (after.total !== before?.total) changed += 1;
  }
  return changed;
}

// ── Reading and the referral ────────────────────────────────────────────

/** @param {any} e */
const entryView = (e) => ({
  id: String(e._id),
  points: e.points,
  offenceCodes: e.offenceCodes,
  caseId: String(e.caseId),
  caseNumber: e.caseNumber,
  source: { type: e.source.type, id: String(e.source.id), number: e.source.number },
  offenceDate: e.offenceDate.toISOString(),
  expiresAt: e.expiresAt.toISOString(),
  expired: e.expiresAt <= new Date(),
  recordedAt: e.recordedAt.toISOString(),
  recordedBy: e.recordedBy,
  reason: e.reason ?? null,
});

/**
 * A person's points (§8): HQ and the stations that handled them — the same
 * rule as opening the person.
 * @param {Actor} actor @param {string} personId
 */
export async function personPoints(actor, personId) {
  if (!(await mayOpenPerson(actor, personId))) throw notFound("Person not found.");
  const [settings, standing, entries] = await Promise.all([
    settingsAt(),
    DemeritStanding.findOne({ personId }).lean(),
    DemeritEntry.find({ personId }).sort({ recordedAt: -1 }).limit(200).lean(),
  ]);
  return {
    enabled: settings.enabled,
    warnAt: settings.warnAt,
    referAt: settings.referAt,
    total: standing?.total ?? 0,
    flag: standing?.flag ?? "none",
    referral: standing?.referral
      ? {
          reference: standing.referral.reference,
          referredOn: standing.referral.referredOn.toISOString(),
          by: standing.referral.by,
        }
      : null,
    entries: entries.map(entryView),
  };
}

/**
 * HQ records the referral to the Department of Motor Traffic (§7).
 * @param {Actor} actor @param {string} personId @param {{ reference: string, referredOn: Date }} input @param {RequestContext} ctx
 */
export async function recordReferral(actor, personId, input, ctx) {
  if (!mongoose.isValidObjectId(personId)) throw notFound("Person not found.");
  const standing = await DemeritStanding.findOne({ personId }).lean();
  if (standing?.flag !== "threshold")
    throw conflict("not_due", "This person hasn't reached the suspension threshold.");
  if (standing.referral) throw conflict("referred", "The referral is recorded already.");
  await inTransaction(async (session) => {
    await DemeritStanding.updateOne(
      { personId },
      {
        $set: {
          referral: {
            reference: input.reference,
            referredOn: input.referredOn,
            by: actor.name,
            at: new Date(),
          },
        },
      },
      { session },
    );
    await recordAudit(
      {
        actor: { kind: "staff", id: actor.userId, name: actor.name, role: actor.role },
        action: "demerit.referred",
        summary: `Referred to the Department of Motor Traffic (${input.reference}) at ${standing.total} points`,
        target: { type: "person", id: String(personId), label: "Demerit referral" },
        source: ctx,
      },
      session,
    );
  });
  return personPoints(actor, personId);
}

/** People at or above a threshold, for HQ (§7). @param {{ flag: "approaching" | "threshold", page: number, pageSize: number }} q */
export async function listStandings({ flag, page, pageSize }) {
  const filter = { flag };
  const [rows, total] = await Promise.all([
    DemeritStanding.find(filter)
      .sort({ "referral.at": 1, total: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    DemeritStanding.countDocuments(filter),
  ]);
  const people = new Map(
    (
      await Person.find(
        { _id: { $in: rows.map((r) => r.personId) } },
        { name: 1, licenceNumber: 1 },
      ).lean()
    ).map((p) => [String(p._id), p]),
  );
  return {
    items: rows.map((r) => ({
      personId: String(r.personId),
      name: people.get(String(r.personId))?.name ?? "—",
      licenceNumber: people.get(String(r.personId))?.licenceNumber ?? null,
      total: r.total,
      flag: r.flag,
      flaggedAt: r.flaggedAt?.toISOString() ?? null,
      referred: Boolean(r.referral),
    })),
    total,
    page,
    pageSize,
  };
}

/** The points a notice carries, shown on it when the scheme is on (§8). @param {any} n */
export async function pointsOnNotice(n) {
  if (n.kind !== "penalty" || !(await settingsAt()).enabled) return null;
  const rows = await OffenceVersion.find(
    { code: { $in: n.offences.map((/** @type {any} */ o) => o.code) }, current: true },
    { demeritPoints: 1 },
  ).lean();
  return rows.reduce((s, o) => s + (o.demeritPoints ?? 0), 0);
}

// Reports and triage — docs/02.
//
//   pending ─┬─► accepted   a case is opened (dispatch comes with N3)
//            ├─► merged     attached to an existing case
//            ├─► needs_info a question to the reporter → back to pending on reply
//            └─► rejected   reason code + note
//
// Station-recorded reports open a case at the station at once and are then
// reviewed by HQ. An officer's own observation needs a second officer or
// the OIC to open the case (separation of duties, docs/01 §5).

import mongoose from "mongoose";
import { scopeOf } from "#src/core/access/permissions.js";
import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { nextNumber } from "#src/core/db/counters.js";
import { conflict, forbidden, notFound, validationError } from "#src/core/errors.js";
import { toPoint } from "#src/core/geo.js";
import { normalizePlate, recordNumber } from "#src/core/srilanka.js";
import {
  Case,
  attachReport,
  autoPlan,
  detachReport,
  onCaseDecided,
  onCaseMoved,
  onCasesMerged,
  openCase,
  provideReportLookup,
} from "../cases/index.js";
import { evidenceList, recordEvidence, storeFile } from "../evidence/index.js";
import { activeOffences, suggestPriority } from "../offences/index.js";
import { Station } from "../organisation/organisation.model.js";
import { flagReporter, standingOf } from "../reporters/index.js";
import { limitAt, limitValue } from "../settings/settings.service.js";
import { ACTION_TAKEN, CLOSED_NO_ACTION, publishUpdate, updateFor } from "./citizen-updates.js";
import { REJECTION_REASONS, Report } from "./report.model.js";
import { reportView } from "./reports.views.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */
/** @typedef {{ ip: string | null, userAgent: string | null }} RequestContext */
/** @typedef {import("./report.model.js").ReportDocument} ReportDocument */

const DAY = 86_400_000;
const escapeRegex = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PRIORITY_ORDER = { P1: 1, P2: 2, P3: 3 };
const CHANNEL_WORDS = {
  whatsapp: "WhatsApp",
  phone: "phone",
  walk_in: "walk-in",
  officer: "officer observed",
  citizen_app: "mobile app",
};
/** @param {string} c */
const channelWord = (c) => CHANNEL_WORDS[/** @type {keyof typeof CHANNEL_WORDS} */ (c)] ?? c;

/** @param {Actor} actor */
const by = (actor) => ({ id: actor.userId, name: actor.name });
/** @param {Actor} actor */
const auditActor = (actor) => ({
  kind: /** @type {const} */ ("staff"),
  id: actor.userId,
  name: actor.name,
  role: actor.role,
});

/**
 * One audited change to a report, in a transaction.
 * @param {Actor} actor @param {ReportDocument} report @param {RequestContext} ctx
 * @param {string} action @param {(session: import("mongoose").ClientSession) => Promise<string>} apply
 */
async function change(actor, report, ctx, action, apply) {
  const statusBefore = report.status;
  await inTransaction(async (session) => {
    const summary = await apply(session);
    // A mobile-app reporter hears of every change of status (docs/11 §5).
    const update = report.status !== statusBefore ? updateFor(report) : null;
    if (update) await publishUpdate(session, report, update);
    report.history.push({
      at: new Date(),
      event: action.split(".")[1] ?? action,
      by: actor.name,
      note: summary,
    });
    await report.save({ session });
    await recordAudit(
      {
        actor: auditActor(actor),
        action,
        summary,
        target: { type: "report", id: String(report._id), label: report.reportNumber },
        source: ctx,
        places: [actor, { stationId: report.stationId }],
      },
      session,
    );
  });
}

// ── Scope ───────────────────────────────────────────────────────────────

/** Reports the user may see (docs/20 §5.1). @param {Actor} actor */
async function scopeFilter(actor) {
  const scope = scopeOf(actor.role, "reports.view");
  if (scope === "N" || scope === "R") return {};
  if (scope === "S") return { stationId: actor.stationId };
  if (scope === "D") {
    return {
      stationId: { $in: await Station.find({ divisionId: actor.divisionId }).distinct("_id") },
    };
  }
  throw forbidden();
}

/** @param {Actor} actor @param {string} id */
async function loadVisible(actor, id) {
  if (!mongoose.isValidObjectId(id)) throw notFound("Report not found.");
  const report = await Report.findOne({ _id: id, ...(await scopeFilter(actor)) });
  if (!report) throw notFound("Report not found.");
  return report;
}

/** For other modules (evidence): a report the user may see, or 404. */
export const visibleReport = loadVisible;

// ── Recording ───────────────────────────────────────────────────────────

/**
 * A report recorded by staff (docs/02 §3, §7). HQ records WhatsApp and phone
 * reports into the triage queue; a station records phone, walk-in and
 * officer reports and opens the station's case at once.
 * @param {Actor} actor @param {any} input @param {RequestContext} ctx
 */
export async function recordReport(actor, input, ctx) {
  const national = scopeOf(actor.role, "reports.record") === "N";
  if (national && !["whatsapp", "phone"].includes(input.channel)) {
    throw validationError({
      channel:
        "HQ records WhatsApp messages and phone calls. Walk-ins and officers' reports are recorded at stations.",
    });
  }
  if (!national && input.channel === "whatsapp") {
    throw validationError({ channel: "WhatsApp reports are recorded by HQ." });
  }
  const offences = await activeOffences(input.offenceCodes, { vehicleType: input.vehicleType });
  const priority = suggestPriority(offences, input.injuries);
  const atStation = !national;
  const officerObserved = input.channel === "officer";

  /** @type {ReportDocument | undefined} */
  let created;
  await inTransaction(async (session) => {
    const reportNumber = recordNumber("RP", await nextNumber("reports", session));
    const status = !atStation
      ? "pending"
      : officerObserved
        ? "awaiting_second_officer"
        : "accepted";
    const [r] = await Report.create(
      [
        {
          reportNumber,
          channel: input.channel,
          receivedAt: new Date(),
          receivedBy: by(actor),
          stationId: atStation ? actor.stationId : null,
          stationOriginated: atStation,
          reporter:
            input.reporter.kind === "named"
              ? { kind: "named", name: input.reporter.name, phone: input.reporter.phone ?? null }
              : { kind: "anonymous" },
          occurredAt: input.occurredAt,
          location:
            input.lat !== undefined && input.lng !== undefined
              ? toPoint(input.lat, input.lng)
              : null,
          address: input.address ?? null,
          vehicleNumber: input.vehicleNumber ?? null,
          plateUnknown: input.plateUnknown,
          vehicleType: input.vehicleType ?? null,
          offenceCodes: offences.map((o) => o.code),
          description: input.description,
          injuries: input.injuries,
          status,
          priority,
          history: [
            {
              at: new Date(),
              event: "received",
              by: actor.name,
              note: `Recorded (${channelWord(input.channel)})`,
            },
          ],
        },
      ],
      { session },
    );
    const report = /** @type {ReportDocument} */ (r);
    if (status === "accepted") {
      const c = await openCase(session, {
        priority,
        facts: factsOf(report),
        reportId: report._id,
        by: by(actor),
        note: "Recorded at the station",
        atStation: await stationCase(actor),
      });
      report.caseId = c._id;
      await report.save({ session });
    }
    await recordAudit(
      {
        actor: auditActor(actor),
        action: "reports.recorded",
        summary: `Recorded ${reportNumber} (${channelWord(input.channel)})${status === "accepted" ? " and opened the station's case" : ""}`,
        target: { type: "report", id: String(report._id), label: reportNumber },
        source: ctx,
        places: [actor],
      },
      session,
    );
    created = report;
  });
  return getReport(actor, String(/** @type {ReportDocument} */ (created)._id));
}

/**
 * A case recorded at the user's own station: accepted there at once. Its
 * investigating officer is the person recording it when they can
 * investigate (an officer or the OIC); a clerk's case waits for the OIC to
 * assign one (docs/03 §6).
 * @param {Actor} actor
 */
async function stationCase(actor) {
  const station = await Station.findById(actor.stationId, { name: 1 }).lean();
  return {
    stationId: actor.stationId,
    stationName: station?.name ?? "Station",
    officer: ["traffic_officer", "station_oic"].includes(actor.role) ? by(actor) : null,
  };
}

/** The report's own details as a case's starting facts. @param {ReportDocument} r */
const factsOf = (r) => ({
  offenceCodes: [...r.offenceCodes],
  vehicleNumber: r.vehicleNumber ?? null,
  plateUnknown: r.plateUnknown,
  vehicleType: r.vehicleType ?? null,
  location: r.location ?? null,
  address: r.address ?? null,
  occurredAt: r.occurredAt,
});

/**
 * An officer's own observation: another officer or the OIC at the station
 * opens the case (docs/02 §7).
 * @param {Actor} actor @param {string} id @param {RequestContext} ctx
 */
export async function secondOfficerAccept(actor, id, ctx) {
  const report = await loadVisible(actor, id);
  if (report.status !== "awaiting_second_officer")
    throw conflict("not_waiting", "This report isn't waiting for a second officer.");
  if (String(report.receivedBy.id) === String(actor.userId)) {
    throw forbidden("Another officer or the OIC must open the case for your own observation.");
  }
  await change(actor, report, ctx, "reports.second_officer_accepted", async (session) => {
    const c = await openCase(session, {
      priority: /** @type {any} */ (report.priority),
      facts: factsOf(report),
      reportId: report._id,
      by: by(actor),
      note: `Officer-observed report confirmed by ${actor.name}`,
      atStation: await stationCase(actor),
    });
    report.caseId = c._id;
    report.status = "accepted";
    return `Confirmed the officer's report and opened ${c.caseNumber}`;
  });
  return getReport(actor, id);
}

// ── Reading ─────────────────────────────────────────────────────────────

/** @param {Actor} actor @param {any} query */
export async function listReports(actor, query) {
  /** @type {any[]} */
  const and = [await scopeFilter(actor)];
  const views = {
    triage: { status: "pending" },
    needs_info: { status: "needs_info" },
    station_review: { stationOriginated: true, stationReviewed: false, status: "accepted" },
    second_officer: { status: "awaiting_second_officer" },
    accepted: { status: { $in: ["accepted", "merged"] } },
    rejected: { status: "rejected" },
    all: {},
  };
  and.push(views[/** @type {keyof typeof views} */ (query.view)]);
  if (query.channel) and.push({ channel: query.channel });
  if (query.priority) and.push({ priority: query.priority });
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), "i");
    // A plate in any spelling ("cpcar4804") also finds its normalised form.
    const plate = normalizePlate(query.q);
    and.push({
      $or: [
        { reportNumber: rx },
        { vehicleNumber: rx },
        { address: rx },
        ...(plate ? [{ vehicleNumber: plate }] : []),
      ],
    });
  }
  const filter = { $and: and };
  // The triage queue: highest priority first, then oldest (docs/02 §5).
  const sort = query.view === "triage" ? { priority: 1, receivedAt: 1 } : { receivedAt: -1 };
  const [rows, total] = await Promise.all([
    Report.find(filter)
      .sort(/** @type {any} */ (sort))
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    Report.countDocuments(filter),
  ]);
  const [caseNumbers, standing] = await Promise.all([caseNumbersOf(rows), standingOfRows(rows)]);
  return {
    items: rows.map((r) =>
      reportView(r, {
        caseNumbers,
        actor,
        detailed: false,
        standing: r.source?.userId ? (standing.get(r.source.userId) ?? null) : null,
      }),
    ),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** @param {any[]} reports */
async function caseNumbersOf(reports) {
  const ids = reports.map((r) => r.caseId).filter(Boolean);
  const cases = ids.length ? await Case.find({ _id: { $in: ids } }, { caseNumber: 1 }).lean() : [];
  return new Map(cases.map((c) => [String(c._id), c.caseNumber]));
}

/**
 * Possible duplicates for triage — docs/02 §5: the same plate within 24 h,
 * or the same offence within ~150 m within 24 h; among reports and cases.
 * @param {any} r
 */
async function possibleMatches(r) {
  const from = new Date(r.occurredAt.getTime() - DAY);
  const to = new Date(r.occurredAt.getTime() + DAY);
  /** @type {any[]} */
  const or = [];
  if (r.vehicleNumber) or.push({ vehicleNumber: r.vehicleNumber });
  if (r.location) {
    or.push({
      offenceCodes: { $in: r.offenceCodes },
      location: { $geoWithin: { $centerSphere: [r.location.coordinates, 0.15 / 6378.1] } },
    });
  }
  if (!or.length) return { reports: [], cases: [] };
  const reports = await Report.find({
    _id: { $ne: r._id },
    occurredAt: { $gte: from, $lte: to },
    $or: or,
  })
    .limit(10)
    .lean();
  const caseOr = or.map((c) =>
    c.vehicleNumber
      ? { "facts.vehicleNumber": c.vehicleNumber }
      : { "facts.offenceCodes": c.offenceCodes, "facts.location": c.location },
  );
  const cases = await Case.find({
    "facts.occurredAt": { $gte: from, $lte: to },
    $or: caseOr,
    _id: { $ne: r.caseId },
  })
    .limit(10)
    .lean();
  return {
    reports: reports.map((m) => ({
      id: String(m._id),
      reportNumber: m.reportNumber,
      status: m.status,
      vehicleNumber: m.vehicleNumber,
      occurredAt: m.occurredAt.toISOString(),
      why:
        m.vehicleNumber && m.vehicleNumber === r.vehicleNumber
          ? "Same plate"
          : "Same offence nearby",
    })),
    cases: cases.map((c) => ({
      id: String(c._id),
      caseNumber: c.caseNumber,
      status: c.status,
      vehicleNumber: c.facts.vehicleNumber,
      occurredAt: c.facts.occurredAt.toISOString(),
      why:
        c.facts.vehicleNumber && c.facts.vehicleNumber === r.vehicleNumber
          ? "Same plate"
          : "Same offence nearby",
    })),
  };
}

/** @param {Actor} actor @param {string} id */
export async function getReport(actor, id) {
  const r = (await loadVisible(actor, id)).toObject();
  const triage = scopeOf(actor.role, "reports.triage") === "N";
  const userId = r.source?.userId ?? null;
  const [caseNumbers, matches, standing, abuse, answerDueAt] = await Promise.all([
    caseNumbersOf([r]),
    triage ? possibleMatches(r) : Promise.resolve(null),
    standingOfRows([r]),
    triage && userId ? recentAbuse(userId) : Promise.resolve(null),
    r.status === "needs_info" && r.triage.askedAt
      ? limitAt("reports.needs_info_reply", r.triage.askedAt)
      : Promise.resolve(null),
  ]);
  return {
    ...reportView(r, {
      caseNumbers,
      actor,
      detailed: true,
      standing: userId ? (standing.get(userId) ?? null) : null,
    }),
    evidence: await evidenceList(r.evidenceIds ?? []),
    matches,
    abuse,
    answerDueAt: answerDueAt ? answerDueAt.toISOString() : null,
  };
}

/**
 * The reporter's rejections as false or abusive in the counting period,
 * for triage (docs/02 §10). @param {string} userId
 */
async function recentAbuse(userId) {
  const [days, threshold] = await Promise.all([
    limitValue("reports.abuse_window"),
    limitValue("reports.abuse_threshold"),
  ]);
  const count = await Report.countDocuments({
    "source.userId": userId,
    status: "rejected",
    "triage.reasonCode": { $in: ABUSE_REASONS },
    "triage.decidedAt": { $gte: new Date(Date.now() - days * DAY) },
  });
  return { count, threshold, days };
}

// ── Evidence ────────────────────────────────────────────────────────────

/**
 * Adds an evidence file to a report — e.g. the photo sent on WhatsApp, or a
 * walk-in reporter's video (docs/10 §3). The original is stored as received.
 * @param {Actor} actor @param {string} id
 * @param {import("../evidence/receive-upload.js").ReceivedFile} file
 * @param {import("#src/core/storage.js").Storage} storage
 * @param {RequestContext} ctx
 */
export async function addEvidence(actor, id, file, storage, ctx) {
  try {
    const report = await loadVisible(actor, id);
    if (["rejected", "merged"].includes(report.status)) {
      throw conflict(
        "closed_report",
        "Evidence can't be added to a rejected or merged report. Add it to the case instead.",
      );
    }
    if (report.evidenceIds.length >= 20)
      throw conflict("too_many", "A report can hold up to 20 evidence files.");
    const key = await storeFile(storage, file);
    try {
      await change(actor, report, ctx, "reports.evidence_added", async (session) => {
        const item = await recordEvidence(session, {
          key,
          file,
          reportId: report._id,
          receivedVia: report.channel,
          by: by(actor),
        });
        report.evidenceIds.push(item._id);
        return `Added a ${file.type.kind} (${Math.ceil(file.size / 1024)} KB, fingerprint ${file.sha256.slice(0, 12)}…)`;
      });
    } catch (err) {
      // The record wasn't written: don't leave an orphaned file in storage.
      await storage.remove(key).catch(() => {});
      throw err;
    }
    return getReport(actor, id);
  } finally {
    await file.cleanUp();
  }
}

// ── Triage ──────────────────────────────────────────────────────────────

/** Someone else holds the triage lock (docs/02 §5). @param {Actor} actor @param {any} r */
function assertNotLockedByOther(actor, r) {
  const lock = r.triage;
  if (
    lock.lockedUntil &&
    lock.lockedUntil > new Date() &&
    String(lock.lockedBy?.id) !== String(actor.userId)
  ) {
    throw conflict(
      "locked",
      `${lock.lockedBy?.name ?? "Someone"} is triaging this report. Try again in a few minutes.`,
    );
  }
}

/** Takes the 15-minute triage lock. @param {Actor} actor @param {string} id */
export async function takeLock(actor, id) {
  const report = await loadVisible(actor, id);
  assertNotLockedByOther(actor, report);
  const minutes = await limitValue("reports.triage_lock");
  report.triage.lockedBy = { id: actor.userId, name: actor.name };
  report.triage.lockedUntil = new Date(Date.now() + minutes * 60_000);
  await report.save();
  return { lockedUntil: report.triage.lockedUntil.toISOString() };
}

/** @param {Actor} actor @param {string} id */
export async function releaseLock(actor, id) {
  const report = await loadVisible(actor, id);
  if (String(report.triage.lockedBy?.id) === String(actor.userId)) {
    report.triage.lockedBy = { id: null, name: null };
    report.triage.lockedUntil = null;
    await report.save();
  }
}

/**
 * Loads a report for a triage decision and checks its state and the lock.
 * @param {Actor} actor @param {string} id @param {string[]} allowed statuses
 */
async function forTriage(actor, id, allowed) {
  const report = await loadVisible(actor, id);
  if (!allowed.includes(report.status)) {
    throw conflict(
      "wrong_state",
      "This report has already been dealt with. Reload to see its current state.",
    );
  }
  assertNotLockedByOther(actor, report);
  return report;
}

/** @param {ReportDocument} r @param {Actor} actor */
function decided(r, actor) {
  r.triage.decidedBy = actor.name;
  r.triage.decidedAt = new Date();
  r.triage.lockedBy = { id: null, name: null };
  r.triage.lockedUntil = null;
}

/** A station-recorded report under HQ review. @param {ReportDocument} r */
const underStationReview = (r) =>
  r.stationOriginated && !r.stationReviewed && r.status === "accepted";

/**
 * Accept: a new case with HQ's conclusions (docs/02 §6.1). A citizen report
 * needs evidence, or a recorded reason to proceed without.
 * @param {Actor} actor @param {string} id @param {any} input @param {RequestContext} ctx
 */
export async function acceptReport(actor, id, input, ctx) {
  const report = await forTriage(actor, id, ["pending"]);
  const offences = await activeOffences(input.offenceCodes, { vehicleType: input.vehicleType });
  if (
    report.channel === "citizen_app" &&
    report.evidenceIds.length === 0 &&
    !input.noEvidenceReason
  ) {
    throw validationError({
      noEvidenceReason: "This citizen report has no evidence. Say why it can go ahead without.",
    });
  }
  const facts = {
    offenceCodes: offences.map((o) => o.code),
    vehicleNumber: input.vehicleNumber ?? null,
    plateUnknown: input.plateUnknown,
    vehicleType: input.vehicleType ?? null,
    location:
      input.lat !== undefined && input.lng !== undefined ? toPoint(input.lat, input.lng) : null,
    address: input.address ?? null,
    occurredAt: input.occurredAt,
  };
  // The station is chosen before the transaction (docs/03 §5.1); none → HQ chooses (C8).
  const plan = await autoPlan(facts);
  await change(actor, report, ctx, "reports.accepted", async (session) => {
    const c = await openCase(session, {
      priority: input.priority,
      facts,
      reportId: report._id,
      noEvidenceReason: input.noEvidenceReason ?? null,
      by: by(actor),
      note: `Accepted ${report.reportNumber} at triage`,
      plan,
    });
    report.status = "accepted";
    report.caseId = c._id;
    report.stationId = c.stationId ?? null;
    report.priority = input.priority;
    decided(report, actor);
    return `Accepted; opened ${c.caseNumber}${plan ? ` and sent it to ${plan.stationName}` : " (no station found: HQ chooses)"}`;
  });
  return getReport(actor, id);
}

/**
 * Merge into an existing case (docs/02 §6.2). For a station-recorded report
 * under review, it leaves the station's case first.
 * @param {Actor} actor @param {string} id @param {{ caseId: string, note?: string }} input @param {RequestContext} ctx
 */
export async function mergeReport(actor, id, input, ctx) {
  const report = await loadVisible(actor, id);
  if (!(report.status === "pending" || underStationReview(report))) {
    throw conflict("wrong_state", "This report can't be merged now.");
  }
  assertNotLockedByOther(actor, report);
  const target = await Case.findById(input.caseId);
  if (!target) throw validationError({ caseId: "Case not found." });
  if (String(target._id) === String(report.caseId))
    throw validationError({ caseId: "The report is already on this case." });
  await change(actor, report, ctx, "reports.merged", async (session) => {
    if (report.caseId)
      await detachReport(
        session,
        report.caseId,
        report._id,
        actor.name,
        `Merged into ${target.caseNumber}`,
      );
    await attachReport(session, target._id, report._id, actor.name);
    report.status = "merged";
    report.caseId = target._id;
    report.stationReviewed = true;
    if (target.stationId) report.stationId = target.stationId;
    decided(report, actor);
    report.triage.note = input.note ?? null;
    return `Merged into ${target.caseNumber}${target.status === "closed" ? " (closed case — added as information, not reopened)" : ""}`;
  });
  return getReport(actor, id);
}

/** HQ undoes a merge: the report returns to the queue (docs/02 §6.2). @param {Actor} actor @param {string} id @param {string} reason @param {RequestContext} ctx */
export async function undoMerge(actor, id, reason, ctx) {
  const report = await forTriage(actor, id, ["merged"]);
  await change(actor, report, ctx, "reports.merge_undone", async (session) => {
    if (report.caseId)
      await detachReport(session, report.caseId, report._id, actor.name, `Merge undone: ${reason}`);
    report.caseId = null;
    report.status = "pending";
    return `Merge undone: ${reason}`;
  });
  return getReport(actor, id);
}

/** Ask the reporter a question (docs/02 §6.3). @param {Actor} actor @param {string} id @param {string} question @param {RequestContext} ctx */
export async function askReporter(actor, id, question, ctx) {
  const report = await forTriage(actor, id, ["pending"]);
  if (report.reporter.kind === "anonymous") {
    throw conflict(
      "anonymous",
      "Anonymous reporters can't be asked. Accept, merge or reject the report.",
    );
  }
  await change(actor, report, ctx, "reports.question_asked", async () => {
    report.status = "needs_info";
    report.triage.question = question;
    report.triage.askedAt = new Date();
    decided(report, actor);
    return `Asked the reporter: ${question}`;
  });
  return getReport(actor, id);
}

/**
 * The reporter's answer, recorded by staff (phone/WhatsApp). The report goes
 * back to the queue in its original place. Citizen-app answers arrive with
 * the mobile-app import.
 * @param {Actor} actor @param {string} id @param {string} answer @param {RequestContext} ctx
 */
export async function recordReply(actor, id, answer, ctx) {
  const report = await forTriage(actor, id, ["needs_info"]);
  await change(actor, report, ctx, "reports.reply_recorded", async () => {
    report.triage.replies.push({ at: new Date(), text: answer, recordedBy: actor.name });
    report.status = "pending";
    return "Recorded the reporter's answer; back in the queue";
  });
  return getReport(actor, id);
}

/** @param {Actor} actor @param {string} id @param {{ reasonCode: string, note?: string }} input @param {RequestContext} ctx */
export async function rejectReport(actor, id, input, ctx) {
  const report = await loadVisible(actor, id);
  if (!(["pending", "needs_info"].includes(report.status) || underStationReview(report))) {
    throw conflict("wrong_state", "This report can't be rejected now.");
  }
  assertNotLockedByOther(actor, report);
  await change(actor, report, ctx, "reports.rejected", async (session) => {
    if (report.caseId) {
      await detachReport(
        session,
        report.caseId,
        report._id,
        actor.name,
        `Report rejected at HQ review (${input.reasonCode})`,
      );
      report.caseId = null;
    }
    report.status = "rejected";
    report.stationReviewed = true;
    report.triage.reasonCode = input.reasonCode;
    report.triage.note = input.note ?? null;
    decided(report, actor);
    const flagged = await countAbuse(session, report, actor);
    return `Rejected: ${input.reasonCode.replaceAll("_", " ")}${flagged ? `; reporter flagged (${flagged})` : ""}`;
  });
  return getReport(actor, id);
}

const ABUSE_REASONS = ["fabricated", "abusive"];

/**
 * Rejections as fabricated or abusive count against a mobile-app reporter;
 * enough within the period flags them (docs/02 §10). Returns the reason
 * when the reporter was flagged now.
 * @param {import("mongoose").ClientSession} session @param {ReportDocument} report @param {Actor} actor
 */
async function countAbuse(session, report, actor) {
  const userId = report.source?.userId;
  if (!userId || !ABUSE_REASONS.includes(report.triage.reasonCode ?? "")) return null;
  const [days, threshold] = await Promise.all([
    limitValue("reports.abuse_window"),
    limitValue("reports.abuse_threshold"),
  ]);
  const others = await Report.countDocuments(
    {
      _id: { $ne: report._id },
      "source.userId": userId,
      status: "rejected",
      "triage.reasonCode": { $in: ABUSE_REASONS },
      "triage.decidedAt": { $gte: new Date(Date.now() - days * DAY) },
    },
    { session },
  );
  const count = others + 1;
  if (count < threshold) return null;
  const reason = `${count} reports rejected as false or abusive within ${days} days`;
  return (await flagReporter(session, userId, reason, actor.name)) ? reason : null;
}

/** Whether a mobile-app reporter's reports need extra care, for lists. @param {any[]} rows */
async function standingOfRows(rows) {
  return standingOf(rows.map((r) => r.source?.userId).filter(Boolean));
}

/** HQ confirms a station-recorded report as it is. @param {Actor} actor @param {string} id @param {RequestContext} ctx */
export async function confirmStationReport(actor, id, ctx) {
  const report = await loadVisible(actor, id);
  if (!underStationReview(report))
    throw conflict("wrong_state", "This report isn't waiting for HQ review.");
  await change(actor, report, ctx, "reports.station_review_confirmed", async () => {
    report.stationReviewed = true;
    decided(report, actor);
    return "Reviewed at HQ: station case confirmed";
  });
  return getReport(actor, id);
}

/** A rejected report back to the queue within 30 days (docs/02 §6.4). @param {Actor} actor @param {string} id @param {string} reason @param {RequestContext} ctx */
export async function reconsiderReport(actor, id, reason, ctx) {
  const report = await forTriage(actor, id, ["rejected"]);
  if (!report.triage.decidedAt || Date.now() - report.triage.decidedAt.getTime() > 30 * DAY) {
    throw conflict("too_late", "Rejected reports can be reconsidered within 30 days only.");
  }
  await change(actor, report, ctx, "reports.reconsidered", async () => {
    report.status = "pending";
    report.triage.reasonCode = null;
    return `Reconsidered: ${reason}`;
  });
  return getReport(actor, id);
}

/** @param {Actor} actor @param {string} id @param {{ priority: string, reason: string }} input @param {RequestContext} ctx */
export async function changePriority(actor, id, input, ctx) {
  const report = await forTriage(actor, id, ["pending", "needs_info"]);
  if (report.priority === input.priority)
    throw conflict("no_change", "The report already has this priority.");
  await change(actor, report, ctx, "reports.priority_changed", async () => {
    const from = report.priority;
    report.priority = /** @type {"P1" | "P2" | "P3"} */ (input.priority);
    return `Priority ${from} → ${input.priority}: ${input.reason}`;
  });
  return getReport(actor, id);
}

export { PRIORITY_ORDER, REJECTION_REASONS };

// Reports follow their case: when a case moves station, its reports become
// visible there (station scope is by the report's station).
onCaseMoved(async (session, c) => {
  await Report.updateMany(
    { _id: { $in: c.reportIds } },
    { $set: { stationId: c.stationId ?? null } },
    { session },
  );
});
// The case record lists its reports.
provideReportLookup(async (ids) => {
  const rows = await Report.find(
    { _id: { $in: ids } },
    { reportNumber: 1, status: 1, channel: 1, receivedAt: 1, evidenceIds: 1 },
  ).lean();
  return rows.map((r) => ({
    id: String(r._id),
    reportNumber: r.reportNumber,
    status: r.status,
    channel: r.channel,
    receivedAt: r.receivedAt.toISOString(),
    evidenceIds: (r.evidenceIds ?? []).map(String),
  }));
});
// Mobile-app reporters hear how their case ended (docs/11 §5); never the
// outcome type, the station or any amount.
onCaseDecided(async (session, c) => {
  const reports = await Report.find({ _id: { $in: c.reportIds }, channel: "citizen_app" }, null, {
    session,
  });
  const update =
    c.decision?.outcome.outcome === "no_further_action" ? CLOSED_NO_ACTION : ACTION_TAKEN;
  for (const r of reports) await publishUpdate(session, r, update);
});
// A case merged into another takes its reports along (docs/03 §7).
onCasesMerged(async (session, from, into) => {
  await Report.updateMany(
    { _id: { $in: from.reportIds } },
    { $set: { caseId: into._id, stationId: into.stationId ?? null } },
    { session },
  );
});

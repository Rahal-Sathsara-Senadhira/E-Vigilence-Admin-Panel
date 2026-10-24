// Court cases — docs/06.
//
//   referred ─► prepared ─► approved (OIC) ─► filed ─► hearing ─► verdict ─► closed (OIC confirms)
//   referred / prepared / approved ─► withdrawn (OIC or HQ, reason; or the notice paid first)
//
// A court case is opened when a case is decided "court referral", or when
// the OIC confirms a notice's court referral (unpaid, or unservable). The
// officer prepares, files and records; the OIC approves filing and confirms
// the verdict — never the same person who prepared or recorded it.

import mongoose from "mongoose";
import { scopeOf } from "#src/core/access/permissions.js";
import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { nextNumber } from "#src/core/db/counters.js";
import { conflict, forbidden, notFound, validationError } from "#src/core/errors.js";
import { recordNumber } from "#src/core/srilanka.js";
import { Case, closeAfterOutcome, onCaseDecided } from "../cases/index.js";
import { Evidence } from "../evidence/index.js";
import { markCourtFiled, onCourtReferral, onNoticePaid } from "../notices/index.js";
import { OffenceVersion } from "../offences/offences.model.js";
import { Station } from "../organisation/organisation.model.js";
import { personById } from "../registers/index.js";
import { limitAt, limitValue } from "../settings/settings.service.js";
import { Court, CourtCase } from "./court.model.js";
import { courtCaseView } from "./court.views.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */
/** @typedef {{ ip: string | null, userAgent: string | null }} RequestContext */
/** @typedef {import("./court.model.js").CourtCaseDocument} CourtCaseDocument */

const escapeRegex = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** @param {Actor} actor */
const by = (actor) => ({ id: actor.userId, name: actor.name });

/** @param {CourtCaseDocument} cc @param {string} event @param {string} who @param {string | null} [note] */
function addEvent(cc, event, who, note = null) {
  cc.history.push({ at: new Date(), event, by: who, note });
}

// ── Opening (from a decision or a notice) ───────────────────────────────

/**
 * Opens the court case in the caller's transaction.
 * @param {import("mongoose").ClientSession} session
 * @param {{ route: "court_offence" | "unpaid_notice" | "unserved_notice", c: any, notice?: any,
 *   accusedId: any | null, charges: { code: string, name: string, legalReference: string }[], by: { id: any, name: string }, note: string }} input
 */
async function openCourtCase(session, input) {
  const { c } = input;
  const courtRef = recordNumber("CR", await nextNumber("court_cases", session));
  const person = input.accusedId ? await personById(input.accusedId, session) : null;
  const station = c.stationId
    ? await Station.findById(c.stationId, { defaultCourtId: 1 }, { session }).lean()
    : null;
  const court = station?.defaultCourtId
    ? await Court.findById(station.defaultCourtId, { name: 1 }, { session }).lean()
    : null;
  const [cc] = await CourtCase.create(
    [
      {
        courtRef,
        status: "referred",
        route: input.route,
        caseId: c._id,
        caseNumber: c.caseNumber,
        noticeId: input.notice?._id ?? null,
        noticeNumber: input.notice?.noticeNumber ?? null,
        stationId: c.stationId ?? null,
        accused: person
          ? { personId: person._id, name: person.name, address: person.address ?? null }
          : null,
        courtId: court?._id ?? null,
        courtName: court?.name ?? null,
        charges: input.charges,
        prosecutingOfficer: c.investigatingOfficer
          ? { id: c.investigatingOfficer.id, name: c.investigatingOfficer.name }
          : null,
        prepareBy: await limitAt("court.prepare", new Date()),
        history: [{ at: new Date(), event: "referred", by: input.by.name, note: input.note }],
      },
    ],
    { session },
  );
  const created = /** @type {NonNullable<typeof cc>} */ (cc);
  await recordAudit(
    {
      actor: { kind: "staff", id: input.by.id, name: input.by.name },
      action: "court.referred",
      summary: `Court case ${courtRef} opened for ${c.caseNumber}${input.notice ? ` (notice ${input.notice.noticeNumber})` : ""}`,
      target: { type: "court_case", id: String(created._id), label: courtRef },
      source: { ip: null, userAgent: null },
      places: [{ stationId: c.stationId }],
    },
    session,
  );
  return created;
}

/** The charges for a case: its offences with the law, from the schedule. @param {string[]} codes */
async function chargesFor(codes) {
  const rows = await OffenceVersion.find(
    { code: { $in: codes }, current: true },
    { code: 1, name: 1, legalReference: 1 },
  ).lean();
  return rows.map((o) => ({ code: o.code, name: o.name, legalReference: o.legalReference }));
}

// A case decided "court referral" (docs/06 §3).
onCaseDecided(async (session, c) => {
  const outcome = c.decision?.outcome;
  if (outcome?.outcome !== "court") return;
  /** The decider (docs/05 §4). */
  const decider = /** @type {{ id: any, name: string }} */ (c.decision?.by);
  await openCourtCase(session, {
    route: "court_offence",
    c,
    accusedId: outcome.addresseePerson?.id ?? null,
    charges: await chargesFor(outcome.offenceCodes),
    by: { id: decider.id, name: decider.name },
    note: outcome.driverUnknownReason
      ? `Accused not yet identified: ${outcome.driverUnknownReason}`
      : "Decided: court referral",
  });
});

// A notice's court referral confirmed by the OIC (docs/05 §6.4).
onCourtReferral(async (session, n, ref) => {
  const c = await Case.findById(n.caseId, null, { session }).lean();
  if (!c) return;
  await openCourtCase(session, {
    route: /** @type {"unpaid_notice" | "unserved_notice"} */ (ref.route),
    c,
    notice: n,
    accusedId: n.addressee.personId,
    charges: n.offences.map((o) => ({
      code: o.code,
      name: o.name,
      legalReference: o.legalReference,
    })),
    by: ref.by,
    note: ref.note,
  });
});

// Paid before filing: the court case is withdrawn (docs/06 §9).
onNoticePaid(async (session, n) => {
  const open = await CourtCase.find(
    { noticeId: n._id, status: { $in: ["referred", "prepared", "approved"] } },
    null,
    { session },
  );
  for (const cc of open) {
    cc.status = "withdrawn";
    cc.withdrawal = {
      at: new Date(),
      by: "System",
      reason: `Notice ${n.noticeNumber} paid before filing`,
    };
    addEvent(cc, "withdrawn", "System", cc.withdrawal.reason);
    await cc.save({ session });
  }
});

// ── Scope ───────────────────────────────────────────────────────────────

/** @param {Actor} actor @param {string} permission */
async function stationsFor(actor, permission) {
  const scope = scopeOf(actor.role, permission);
  if (scope === "N" || scope === "R") return null;
  if (scope === "S" || scope === "A") return actor.stationId ? [String(actor.stationId)] : [];
  if (scope === "D")
    return (await Station.find({ divisionId: actor.divisionId }).distinct("_id")).map(String);
  return [];
}

/** @param {Actor} actor @param {string} id */
async function loadVisible(actor, id) {
  if (!mongoose.isValidObjectId(id)) throw notFound("Court case not found.");
  const cc = await CourtCase.findById(id);
  const stations = await stationsFor(actor, "court.view");
  if (!cc || (stations && !stations.includes(String(cc.stationId))))
    throw notFound("Court case not found.");
  return cc;
}

/**
 * Whether the user may do `permission` on this court case. Officers (scope
 * A) only on the cases they prosecute.
 * @param {Actor} actor @param {string} permission @param {any} cc
 */
async function may(actor, permission, cc) {
  const scope = scopeOf(actor.role, permission);
  if (!scope) return false;
  if (scope === "A") return String(cc.prosecutingOfficer?.id ?? "") === String(actor.userId);
  const stations = await stationsFor(actor, permission);
  return stations === null || stations.includes(String(cc.stationId));
}

/**
 * One audited change, in a transaction.
 * @param {Actor} actor @param {CourtCaseDocument} cc @param {RequestContext} ctx @param {string} action
 * @param {(session: import("mongoose").ClientSession) => Promise<string>} apply
 */
async function change(actor, cc, ctx, action, apply) {
  await inTransaction(async (session) => {
    const summary = await apply(session);
    await cc.save({ session });
    await recordAudit(
      {
        actor: { kind: "staff", id: actor.userId, name: actor.name, role: actor.role },
        action,
        summary,
        target: { type: "court_case", id: String(cc._id), label: cc.courtRef },
        source: ctx,
        places: [actor, { stationId: cc.stationId }],
      },
      session,
    );
  });
}

// ── Reading ─────────────────────────────────────────────────────────────

/** @param {Actor} actor @param {any} query */
export async function listCourtCases(actor, query) {
  const stations = await stationsFor(actor, "court.view");
  /** @type {any[]} */
  const and = [
    stations ? { stationId: { $in: stations.map((s) => new mongoose.Types.ObjectId(s)) } } : {},
  ];
  /** @type {Record<string, any>} */
  const views = {
    to_prepare: { status: "referred" },
    to_approve: { status: "prepared" },
    to_file: { status: "approved" },
    hearings: { status: { $in: ["filed", "hearing"] } },
    verdicts_to_confirm: { status: "verdict" },
    flagged: { flaggedToHq: true, status: { $nin: ["closed", "withdrawn"] } },
    closed: { status: { $in: ["closed", "withdrawn"] } },
    all: {},
  };
  and.push(views[query.view] ?? {});
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), "i");
    and.push({
      $or: [{ courtRef: rx }, { caseNumber: rx }, { courtCaseNumber: rx }, { noticeNumber: rx }],
    });
  }
  const filter = { $and: and };
  const [rows, total] = await Promise.all([
    CourtCase.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    CourtCase.countDocuments(filter),
  ]);
  const showPeople = Boolean(scopeOf(actor.role, "persons.view"));
  return {
    items: rows.map((cc) => courtCaseView(cc, { showPeople, can: null })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** @param {Actor} actor @param {string} id */
export async function getCourtCase(actor, id) {
  const cc = (await loadVisible(actor, id)).toObject();
  const [record, approve] = await Promise.all([
    may(actor, "court.record", cc),
    may(actor, "court.confirmReferral", cc),
  ]);
  const preparer = String(cc.preparedBy?.id ?? "");
  const recorder = String(cc.verdict?.recordedBy?.id ?? "");
  const me = String(actor.userId);
  return courtCaseView(cc, {
    showPeople: Boolean(scopeOf(actor.role, "persons.view")),
    can: {
      prepare: record && ["referred", "prepared"].includes(cc.status),
      approve: approve && cc.status === "prepared" && preparer !== me,
      file: record && cc.status === "approved",
      recordHearing: record && ["filed", "hearing"].includes(cc.status),
      recordVerdict: record && ["filed", "hearing"].includes(cc.status),
      confirmVerdict: approve && cc.status === "verdict" && recorder !== me,
      withdraw:
        (approve || scopeOf(actor.role, "court.confirmReferral") === "N") &&
        ["referred", "prepared", "approved"].includes(cc.status),
      recordAppeal: record && cc.status === "closed" && Boolean(cc.verdict) && !cc.appeal,
      decideAppeal: approve && cc.appeal?.result === "pending",
    },
  });
}

// ── The police side ─────────────────────────────────────────────────────

/**
 * The officer prepares the case (docs/06 §5): the accused (one per court
 * case, D06-6), the court, the prosecuting officer and a summary for the
 * prosecution. The OIC then approves filing.
 * @param {Actor} actor @param {string} id @param {any} input @param {RequestContext} ctx
 */
export async function prepareCourtCase(actor, id, input, ctx) {
  const cc = await loadVisible(actor, id);
  if (!(await may(actor, "court.record", cc))) throw forbidden();
  if (!["referred", "prepared"].includes(cc.status))
    throw conflict("wrong_state", "This court case is past preparation.");
  const court = await Court.findOne({ _id: input.courtId, isActive: true }).lean();
  if (!court) throw validationError({ courtId: "Choose a Magistrate's Court." });
  const accusedId = input.accusedPersonId ?? cc.accused?.personId;
  const person = accusedId ? await personById(accusedId) : null;
  if (!person) throw validationError({ accusedPersonId: "Choose the accused from the register." });
  if (!person.address)
    throw validationError({ accusedPersonId: `${person.name} has no address recorded.` });
  await change(actor, cc, ctx, "court.prepared", async () => {
    cc.accused = { personId: person._id, name: person.name, address: person.address };
    cc.courtId = court._id;
    cc.courtName = court.name;
    cc.summary = input.summary;
    if (input.prosecutingOfficer) cc.prosecutingOfficer = input.prosecutingOfficer;
    cc.preparedBy = by(actor);
    cc.preparedAt = new Date();
    cc.status = "prepared";
    addEvent(cc, "prepared", actor.name, `For ${court.name}; accused ${person.name}`);
    return `Prepared ${cc.courtRef} for ${court.name}`;
  });
  return getCourtCase(actor, id);
}

/** The OIC approves filing — not the person who prepared it (D06-2). @param {Actor} actor @param {string} id @param {RequestContext} ctx */
export async function approveFiling(actor, id, ctx) {
  const cc = await loadVisible(actor, id);
  if (!(await may(actor, "court.confirmReferral", cc))) throw forbidden();
  if (cc.status !== "prepared")
    throw conflict("wrong_state", "This court case isn't waiting for approval.");
  if (String(cc.preparedBy?.id) === String(actor.userId)) {
    throw forbidden("You prepared this court case; someone else approves filing.");
  }
  const fileBy = await limitAt("court.file", new Date());
  await change(actor, cc, ctx, "court.approved", async () => {
    cc.status = "approved";
    cc.approvedBy = by(actor);
    cc.approvedAt = new Date();
    cc.fileBy = fileBy;
    addEvent(cc, "approved", actor.name, "Filing approved");
    return `Approved filing of ${cc.courtRef}`;
  });
  return getCourtCase(actor, id);
}

/**
 * Filed (docs/06 §5): the court's case number and the first hearing. A
 * notice can no longer be paid here (D05-6).
 * @param {Actor} actor @param {string} id @param {{ courtCaseNumber: string, firstHearing: Date }} input @param {RequestContext} ctx
 */
export async function fileCourtCase(actor, id, input, ctx) {
  const cc = await loadVisible(actor, id);
  if (!(await may(actor, "court.record", cc))) throw forbidden();
  if (cc.status !== "approved") throw conflict("wrong_state", "Filing must be approved first.");
  await change(actor, cc, ctx, "court.filed", async (session) => {
    cc.courtCaseNumber = input.courtCaseNumber;
    cc.filedAt = new Date();
    cc.status = "filed";
    cc.hearings.push({ date: input.firstHearing });
    if (cc.noticeId) await markCourtFiled(session, cc.noticeId, actor.name, input.courtCaseNumber);
    addEvent(
      cc,
      "filed",
      actor.name,
      `Court case ${input.courtCaseNumber}; first hearing ${input.firstHearing.toISOString().slice(0, 10)}`,
    );
    return `Filed ${cc.courtRef} as ${input.courtCaseNumber}`;
  });
  return getCourtCase(actor, id);
}

/**
 * A hearing's outcome (docs/06 §5, §9). Postponed or heard: the next date.
 * A warrant isn't a verdict; a guilty plea records the conviction too.
 * Many postponements flag the case to HQ.
 * @param {Actor} actor @param {string} id @param {any} input @param {RequestContext} ctx
 */
export async function recordHearing(actor, id, input, ctx) {
  const cc = await loadVisible(actor, id);
  if (!(await may(actor, "court.record", cc))) throw forbidden();
  if (!["filed", "hearing"].includes(cc.status))
    throw conflict("wrong_state", "There is no hearing to record.");
  const pending = cc.hearings.find((h) => !h.outcome);
  if (!pending) throw conflict("no_hearing", "No hearing is scheduled.");
  if (["postponed", "heard"].includes(input.outcome) && !input.nextDate) {
    throw validationError({ nextDate: "Enter the next hearing date." });
  }
  const max = await limitValue("court.max_postponements");
  await change(actor, cc, ctx, `court.hearing_${input.outcome}`, async () => {
    pending.outcome = input.outcome;
    pending.notes = input.notes ?? null;
    pending.nextDate = input.nextDate ?? null;
    pending.recordedBy = actor.name;
    pending.recordedAt = new Date();
    cc.status = "hearing";
    if (input.outcome === "postponed") {
      cc.postponements += 1;
      if (cc.postponements >= max && !cc.flaggedToHq) {
        cc.flaggedToHq = true;
        addEvent(cc, "flagged", "System", `${cc.postponements} postponements: HQ told`);
      }
    }
    if (input.nextDate && input.outcome !== "guilty_plea")
      cc.hearings.push({ date: input.nextDate });
    if (input.outcome === "guilty_plea") {
      cc.verdict = verdictOf({ ...input, result: "convicted", date: pending.date }, actor);
      cc.status = "verdict";
    }
    const summary = `Hearing ${pending.date.toISOString().slice(0, 10)}: ${input.outcome.replaceAll("_", " ")}`;
    addEvent(cc, "hearing", actor.name, summary + (input.notes ? ` — ${input.notes}` : ""));
    return summary;
  });
  return getCourtCase(actor, id);
}

/** @param {any} input @param {Actor} actor */
const verdictOf = (input, actor) => ({
  result: input.result,
  date: input.date,
  sentence: input.sentence ?? null,
  fineAmount: input.fineAmount ?? null,
  fineReceiptNumber: input.fineReceiptNumber ?? null,
  recordedBy: by(actor),
  recordedAt: new Date(),
  confirmedBy: null,
  confirmedAt: null,
});

/**
 * The officer records the verdict (D06-5); the OIC confirms it.
 * @param {Actor} actor @param {string} id @param {any} input @param {RequestContext} ctx
 */
export async function recordVerdict(actor, id, input, ctx) {
  const cc = await loadVisible(actor, id);
  if (!(await may(actor, "court.record", cc))) throw forbidden();
  if (!["filed", "hearing"].includes(cc.status))
    throw conflict("wrong_state", "This court case isn't at hearing.");
  await change(actor, cc, ctx, "court.verdict_recorded", async () => {
    cc.verdict = verdictOf(input, actor);
    cc.status = "verdict";
    addEvent(
      cc,
      "verdict",
      actor.name,
      input.result + (input.fineAmount ? `; fine Rs. ${input.fineAmount}` : ""),
    );
    return `Verdict recorded: ${input.result}`;
  });
  return getCourtCase(actor, id);
}

/**
 * The OIC confirms the verdict — not the person who recorded it (D06-5).
 * The court case and the case close (docs/03 C4). Points and rewards follow
 * with N8 and N10.
 * @param {Actor} actor @param {string} id @param {RequestContext} ctx
 */
export async function confirmVerdict(actor, id, ctx) {
  const cc = await loadVisible(actor, id);
  if (!(await may(actor, "court.confirmReferral", cc))) throw forbidden();
  if (cc.status !== "verdict" || !cc.verdict)
    throw conflict("wrong_state", "There is no verdict to confirm.");
  if (String(cc.verdict.recordedBy.id) === String(actor.userId)) {
    throw forbidden("You recorded this verdict; someone else confirms it.");
  }
  const verdict = cc.verdict;
  await change(actor, cc, ctx, "court.verdict_confirmed", async (session) => {
    verdict.confirmedBy = by(actor);
    verdict.confirmedAt = new Date();
    cc.status = "closed";
    addEvent(cc, "closed", actor.name, `Verdict confirmed: ${verdict.result}`);
    await closeAfterOutcome(
      session,
      cc.caseId,
      actor.name,
      `Court verdict (${cc.courtRef}): ${verdict.result}`,
    );
    return `Confirmed the verdict on ${cc.courtRef}: ${verdict.result}`;
  });
  return getCourtCase(actor, id);
}

/**
 * Withdrawn before filing (docs/06 §5) — by the OIC or HQ, with a reason.
 * The case's outcome ends.
 * @param {Actor} actor @param {string} id @param {string} reason @param {RequestContext} ctx
 */
export async function withdrawCourtCase(actor, id, reason, ctx) {
  const cc = await loadVisible(actor, id);
  if (!(await may(actor, "court.confirmReferral", cc))) throw forbidden();
  if (!["referred", "prepared", "approved"].includes(cc.status)) {
    throw conflict("wrong_state", "A filed court case is ended by the court's verdict.");
  }
  await change(actor, cc, ctx, "court.withdrawn", async (session) => {
    cc.status = "withdrawn";
    cc.withdrawal = { at: new Date(), by: actor.name, reason };
    addEvent(cc, "withdrawn", actor.name, reason);
    await closeAfterOutcome(
      session,
      cc.caseId,
      actor.name,
      `Court case ${cc.courtRef} withdrawn: ${reason}`,
    );
    return `Withdrew ${cc.courtRef}: ${reason}`;
  });
  return getCourtCase(actor, id);
}

/** An appeal against the verdict (D06-7). @param {Actor} actor @param {string} id @param {{ reference: string, filedAt: Date }} input @param {RequestContext} ctx */
export async function recordAppeal(actor, id, input, ctx) {
  const cc = await loadVisible(actor, id);
  if (!(await may(actor, "court.record", cc))) throw forbidden();
  if (cc.status !== "closed" || !cc.verdict || cc.appeal)
    throw conflict("wrong_state", "There is no verdict to appeal.");
  await change(actor, cc, ctx, "court.appeal_recorded", async () => {
    cc.appeal = {
      reference: input.reference,
      filedAt: input.filedAt,
      result: "pending",
      recordedBy: actor.name,
    };
    addEvent(cc, "appeal", actor.name, `Appeal ${input.reference}`);
    return `Appeal ${input.reference} recorded`;
  });
  return getCourtCase(actor, id);
}

/**
 * The appeal's result: the verdict stands, or changes — its effects follow
 * the new verdict (points and rewards, N8/N10).
 * @param {Actor} actor @param {string} id @param {{ result: "upheld" | "changed", newVerdict?: string }} input @param {RequestContext} ctx
 */
export async function decideAppeal(actor, id, input, ctx) {
  const cc = await loadVisible(actor, id);
  if (!(await may(actor, "court.confirmReferral", cc))) throw forbidden();
  if (cc.appeal?.result !== "pending") throw conflict("wrong_state", "There is no appeal waiting.");
  if (input.result === "changed" && !input.newVerdict)
    throw validationError({ newVerdict: "Choose the new verdict." });
  const appeal = cc.appeal;
  await change(actor, cc, ctx, "court.appeal_decided", async () => {
    appeal.result = input.result;
    appeal.newVerdict = input.result === "changed" ? /** @type {any} */ (input.newVerdict) : null;
    appeal.decidedAt = new Date();
    if (input.result === "changed" && cc.verdict)
      cc.verdict.result = /** @type {any} */ (input.newVerdict);
    const summary =
      input.result === "changed"
        ? `Appeal changed the verdict to ${input.newVerdict}`
        : "Appeal: the verdict stands";
    addEvent(cc, "appeal_decided", actor.name, summary);
    return summary;
  });
  return getCourtCase(actor, id);
}

/**
 * The evidence bundle (docs/06 §6): every item on the case and its reports,
 * with its fingerprint — generating it is logged.
 * @param {Actor} actor @param {string} id @param {RequestContext} ctx
 */
export async function evidenceBundle(actor, id, ctx) {
  const cc = await loadVisible(actor, id);
  const c = await Case.findById(cc.caseId, { reportIds: 1, caseNumber: 1, facts: 1 }).lean();
  const items = await Evidence.find(
    { $or: [{ caseId: cc.caseId }, { reportId: { $in: c?.reportIds ?? [] } }] },
    {
      kind: 1,
      mime: 1,
      size: 1,
      sha256: 1,
      originalName: 1,
      receivedVia: 1,
      createdAt: 1,
      reportId: 1,
      caseId: 1,
      capturedInApp: 1,
    },
  )
    .sort({ createdAt: 1 })
    .lean();
  await recordAudit({
    actor: { kind: "staff", id: actor.userId, name: actor.name, role: actor.role },
    action: "court.bundle_generated",
    summary: `Evidence bundle for ${cc.courtRef}: ${items.length} item${items.length === 1 ? "" : "s"}`,
    target: { type: "court_case", id: String(cc._id), label: cc.courtRef },
    source: ctx,
    places: [actor, { stationId: cc.stationId }],
  });
  return {
    courtRef: cc.courtRef,
    courtCaseNumber: cc.courtCaseNumber,
    courtName: cc.courtName,
    caseNumber: cc.caseNumber,
    accused: cc.accused?.name ?? null,
    charges: cc.charges,
    occurredAt: c?.facts?.occurredAt ? c.facts.occurredAt.toISOString() : null,
    place: c?.facts?.address ?? null,
    generatedAt: new Date().toISOString(),
    generatedBy: actor.name,
    items: items.map((e, i) => ({
      no: i + 1,
      id: String(e._id),
      kind: e.kind,
      mime: e.mime,
      size: e.size,
      sha256: e.sha256,
      originalName: e.originalName ?? null,
      source: e.caseId
        ? "Added during investigation"
        : `From a report (${String(e.receivedVia).replaceAll("_", " ")})`,
      receivedAt: e.createdAt.toISOString(),
      capturedInApp: e.capturedInApp ?? null,
    })),
  };
}

// ── Courts (D06-1) ──────────────────────────────────────────────────────

/** @param {boolean} includeInactive */
export async function listCourts(includeInactive) {
  const rows = await Court.find(includeInactive ? {} : { isActive: true })
    .sort({ name: 1 })
    .lean();
  return {
    items: rows.map((c) => ({
      id: String(c._id),
      name: c.name,
      code: c.code,
      district: c.district ?? null,
      address: c.address ?? null,
      isActive: c.isActive,
    })),
  };
}

/** @param {Actor} actor @param {any} input @param {RequestContext} ctx @param {string | null} id */
export async function saveCourt(actor, input, ctx, id = null) {
  if (await Court.exists({ code: input.code.toUpperCase(), ...(id ? { _id: { $ne: id } } : {}) })) {
    throw validationError({ code: "Another court has this code." });
  }
  /** @type {any} */
  let court;
  await inTransaction(async (session) => {
    if (id) {
      court = await Court.findById(id, null, { session });
      if (!court) throw notFound("Court not found.");
      court.set(input);
      await court.save({ session });
    } else {
      [court] = await Court.create([input], { session });
    }
    await recordAudit(
      {
        actor: { kind: "staff", id: actor.userId, name: actor.name, role: actor.role },
        action: id ? "courts.updated" : "courts.created",
        summary: `${id ? "Updated" : "Added"} ${input.name}`,
        target: { type: "court", id: String(court._id), label: input.name },
        source: ctx,
        places: [],
      },
      session,
    );
  });
  return listCourts(true);
}

/** The default court for a station (D06-1). @param {Actor} actor @param {string} stationId @param {string | null} courtId @param {RequestContext} ctx */
export async function setStationCourt(actor, stationId, courtId, ctx) {
  if (!mongoose.isValidObjectId(stationId)) throw notFound("Station not found.");
  const court = courtId ? await Court.findOne({ _id: courtId, isActive: true }).lean() : null;
  if (courtId && !court) throw validationError({ courtId: "Choose an active court." });
  await inTransaction(async (session) => {
    const s = await Station.findById(stationId, null, { session });
    if (!s) throw notFound("Station not found.");
    s.defaultCourtId = court?._id ?? null;
    await s.save({ session });
    await recordAudit(
      {
        actor: { kind: "staff", id: actor.userId, name: actor.name, role: actor.role },
        action: "stations.court_set",
        summary: `Default court for ${s.name}: ${court?.name ?? "none"}`,
        target: { type: "station", id: String(s._id), label: s.name },
        source: ctx,
        places: [{ stationId: s._id }],
      },
      session,
    );
  });
  return { stationId, courtId: court ? String(court._id) : null };
}

// Outcomes — docs/05 §3, §4; docs/03 §7, §8. The investigating officer (or
// the OIC) recommends; someone else decides (S1) — the OIC, or the division
// supervisor when the OIC investigated (S2; an HQ supervisor when the
// station has no division). HQ overrides, reopens and merges, with reasons.

import { scopeOf } from "#src/core/access/permissions.js";
import { conflict, forbidden, notFound, validationError } from "#src/core/errors.js";
import { activeOffences } from "../offences/index.js";
import { Station } from "../organisation/organisation.model.js";
import { personById, vehicleById } from "../registers/index.js";
import { limitAt } from "../settings/settings.service.js";
import { Case } from "./case.model.js";
import { change, getCase, loadVisible } from "./cases.service.js";
import { addEvent, endDispatch } from "./lifecycle.js";
import { worksOn } from "./investigation.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */
/** @typedef {{ ip: string | null, userAgent: string | null }} RequestContext */
/** @typedef {import("./case.model.js").CaseDocument} CaseDocument */

/** Outcomes that count as enforcement (docs/04 §7, docs/05 §7). */
const ENFORCEMENT = ["penalty_notice", "court", "warning"];
const REVIEW_ITEMS = [
  "plateReadable",
  "vehicleMatches",
  "timePlaceConsistent",
  "noEditing",
  "offenceVisible",
];
const YEAR = 365 * 86_400_000;

/** @type {((session: import("mongoose").ClientSession, c: CaseDocument) => Promise<void>)[]} */
const decidedListeners = [];
/**
 * Called when a case is decided, in the same transaction — the reports
 * module tells mobile-app reporters (docs/11 §5).
 * @param {(session: import("mongoose").ClientSession, c: CaseDocument) => Promise<void>} fn
 */
export function onCaseDecided(fn) {
  decidedListeners.push(fn);
}

/** @type {((session: import("mongoose").ClientSession, from: CaseDocument, into: CaseDocument) => Promise<void>)[]} */
const mergedListeners = [];
/** Called when a case is merged into another (its reports move). @param {(session: import("mongoose").ClientSession, from: CaseDocument, into: CaseDocument) => Promise<void>} fn */
export function onCasesMerged(fn) {
  mergedListeners.push(fn);
}

// ── Enforcement history ─────────────────────────────────────────────────

/**
 * Enforcement outcomes decided in the last 12 months for a vehicle and for
 * people, other than this case (docs/04 §7; the warning rule, docs/05 §7).
 * @param {any} c @param {{ personIds?: any[] }} [extra]
 */
export async function enforcementHistory(c, { personIds = [] } = {}) {
  const since = new Date(Date.now() - YEAR);
  const base = {
    _id: { $ne: c._id },
    "decision.outcome.outcome": { $in: ENFORCEMENT },
    "decision.at": { $gte: since },
    "decision.overriddenAt": null,
  };
  const people = [c.owner?.id, c.driver?.id, ...personIds].filter(Boolean);
  const [vehicle, person] = await Promise.all([
    c.vehicle ? Case.countDocuments({ ...base, "vehicle.id": c.vehicle.id }) : 0,
    people.length
      ? Case.countDocuments({ ...base, "decision.outcome.addresseePerson.id": { $in: people } })
      : 0,
  ]);
  return { vehicle, person };
}

// ── What each outcome needs ─────────────────────────────────────────────

/**
 * Why an outcome can't be recommended yet; empty when it can (docs/05 §3,
 * docs/04 §6 "ready to recommend").
 * @param {any} c @param {any} o the outcome: { outcome, addressee, driverUnknownReason, prosecutionSummary, nfaReason }
 * @param {any[]} offences offence schedule entries
 */
async function missingFor(c, o, offences) {
  /** @type {string[]} */
  const missing = [];
  if (o.outcome === "no_further_action") {
    if (!o.nfaReason) missing.push("Choose why no further action is possible.");
    return missing;
  }
  const reviewed = c.review && REVIEW_ITEMS.every((k) => typeof c.review[k] === "boolean");
  if (!reviewed) missing.push("Complete the evidence review.");
  if (!offences.length) missing.push("Confirm at least one offence.");

  const person = o.addressee === "owner" ? c.owner : o.addressee === "driver" ? c.driver : null;
  const record = person ? await personById(person.id) : null;
  const needsAddressee = o.outcome !== "court" || !o.driverUnknownReason;
  if (needsAddressee) {
    if (!o.addressee)
      missing.push(
        c.owner || c.driver
          ? "Choose who it is addressed to: the owner or the driver."
          : "Trace the vehicle's owner or identify the driver.",
      );
    else if (!person)
      missing.push(
        o.addressee === "owner" ? "Trace the vehicle's owner first." : "Identify the driver first.",
      );
    else if (!record?.address && o.outcome !== "court")
      missing.push(`Record ${person.name}'s address — it is needed to serve it.`);
  }
  if (o.addressee === "owner" && c.vehicle) {
    const v = await vehicleById(c.vehicle.id);
    const flags = (v?.flags ?? []).filter((f) => !f.clearedAt);
    if (flags.some((f) => f.type === "suspected_false_plate"))
      missing.push("The plate is suspected false: nothing goes to the registered owner.");
    if (flags.some((f) => f.type === "reported_stolen" && f.since && f.since <= c.facts.occurredAt))
      missing.push(
        "The vehicle was reported stolen before the offence: nothing goes to the owner.",
      );
  }
  if (o.outcome === "penalty_notice") {
    const courtOnly = offences.filter((x) => x.outcome !== "spot_fine").map((x) => x.code);
    if (courtOnly.length) missing.push(`${courtOnly.join(", ")} can only go to court.`);
  }
  if (o.outcome === "warning") {
    const notMinor = offences.filter((x) => x.severity !== "minor").map((x) => x.code);
    if (notMinor.length)
      missing.push(`Warnings are for minor offences only (${notMinor.join(", ")}).`);
    const h = await enforcementHistory(c, { personIds: person ? [person.id] : [] });
    if (h.vehicle || h.person)
      missing.push("An enforcement outcome in the last 12 months rules out a warning.");
  }
  if (o.outcome === "court" && !o.prosecutionSummary)
    missing.push("Write a summary for the prosecution.");
  return missing;
}

/**
 * For the screens: what each outcome still needs with the case as it is
 * (addressed to the driver when known, else the owner).
 * @param {any} c
 */
export async function readiness(c) {
  const offences = await activeOffences(c.facts.offenceCodes).catch(() => []);
  const addressee = c.driver ? "driver" : c.owner ? "owner" : null;
  /** @type {Record<string, string[]>} */
  const result = {};
  for (const outcome of ["penalty_notice", "court", "warning", "no_further_action"]) {
    result[outcome] = await missingFor(
      c,
      {
        outcome,
        addressee,
        prosecutionSummary: outcome === "court" ? "(to be written)" : null,
        nfaReason: outcome === "no_further_action" ? "(to be chosen)" : null,
      },
      offences,
    );
  }
  return result;
}

/**
 * Builds and checks an outcome from a form (recommendation, or the
 * decider's change). Refuses with everything that is missing.
 * @param {CaseDocument} c @param {any} input @param {Actor} actor
 */
async function buildOutcome(c, input, actor) {
  const offences =
    input.outcome === "no_further_action" && !input.offenceCodes?.length
      ? []
      : input.offenceCodes?.length
        ? // Offences chosen now must fit the case's vehicle.
          await activeOffences(input.offenceCodes, { vehicleType: c.facts.vehicleType })
        : // Not given: the case's offences stand as confirmed.
          await activeOffences(c.facts.offenceCodes);
  const missing = await missingFor(c, input, offences);
  if (missing.length) throw notReady(missing);
  const person =
    input.addressee === "owner" ? c.owner : input.addressee === "driver" ? c.driver : null;
  return {
    outcome: input.outcome,
    offenceCodes: offences.map((o) => o.code),
    addressee: person ? input.addressee : null,
    addresseePerson: person ? { id: person.id, name: person.name } : null,
    driverUnknownReason: input.outcome === "court" ? (input.driverUnknownReason ?? null) : null,
    prosecutionSummary: input.outcome === "court" ? (input.prosecutionSummary ?? null) : null,
    nfaReason: input.outcome === "no_further_action" ? input.nfaReason : null,
    justification: input.justification,
    by: { id: actor.userId, name: actor.name, role: actor.role },
    at: new Date(),
  };
}

/** @param {string[]} missing */
function notReady(missing) {
  const err = conflict("not_ready", `Not ready: ${missing.join(" ")}`);
  err.fields = Object.fromEntries(missing.map((m, i) => [`missing${i}`, m]));
  return err;
}

// ── Recommend ───────────────────────────────────────────────────────────

/**
 * The investigating officer (or the OIC) recommends an outcome. Confirmed
 * offences replace the case's (corrections are noted). The decision is
 * due within the limit (default 3 days).
 * @param {Actor} actor @param {string} id @param {any} input @param {RequestContext} ctx
 */
export async function recommend(actor, id, input, ctx) {
  const c = await loadVisible(actor, id);
  if (!worksOn(actor, c)) {
    throw forbidden("The investigating officer or the station's OIC recommends the outcome.");
  }
  if (!["accepted", "investigating"].includes(c.status))
    throw conflict("wrong_state", "This case isn't being investigated.");
  const outcome = await buildOutcome(c, input, actor);
  const decideBy = await limitAt("cases.decide", new Date());
  await change(actor, c, ctx, "cases.recommended", async () => {
    if (
      outcome.offenceCodes.length &&
      outcome.offenceCodes.join(",") !== [...c.facts.offenceCodes].join(",")
    ) {
      addEvent(
        c,
        "offences_corrected",
        actor.name,
        `${c.facts.offenceCodes.join(", ")} → ${outcome.offenceCodes.join(", ")}`,
      );
      c.facts.offenceCodes = outcome.offenceCodes;
    }
    c.recommendations.push(outcome);
    c.status = "recommended";
    c.decideBy = decideBy;
    c.decideLevel = await deciderLevel(c);
    const summary = `Recommended ${say(outcome.outcome)}: ${outcome.justification}`;
    addEvent(c, "recommended", actor.name, summary);
    return summary;
  });
  return getCase(actor, id);
}

/** @param {string} outcome */
const say = (outcome) => outcome.replaceAll("_", " ");

// ── Decide ──────────────────────────────────────────────────────────────

/**
 * Who decides this case (docs/01 S2, docs/20 D20-3).
 * @param {any} c @returns {Promise<"oic" | "division" | "hq">}
 */
async function deciderLevel(c) {
  const rec = c.recommendations.at(-1);
  if (rec?.by.role !== "station_oic") return "oic";
  const station = c.stationId
    ? await Station.findById(c.stationId, { divisionId: 1 }).lean()
    : null;
  return station?.divisionId ? "division" : "hq";
}

/**
 * Whether the user decides the case now — never the person who recommended
 * it (S1).
 * @param {Actor} actor @param {any} c
 */
export async function mayDecide(actor, c) {
  if (c.status !== "recommended" || !scopeOf(actor.role, "cases.decide")) return false;
  const rec = c.recommendations.at(-1);
  if (!rec || String(rec.by.id) === String(actor.userId)) return false;
  const level = await deciderLevel(c);
  if (level === "oic")
    return actor.role === "station_oic" && String(c.stationId) === String(actor.stationId);
  if (level === "hq") return actor.role === "hq_supervisor";
  const station = await Station.findById(c.stationId, { divisionId: 1 }).lean();
  return (
    actor.role === "division_supervisor" && String(station?.divisionId) === String(actor.divisionId)
  );
}

/**
 * Approve, change the outcome (with a reason), or send back for more work
 * (with a reason). On approval the case is "decided" and its facts locked;
 * no further action closes it (nothing more to run, docs/03 C4).
 * @param {Actor} actor @param {string} id @param {any} input @param {RequestContext} ctx
 */
export async function decide(actor, id, input, ctx) {
  const c = await loadVisible(actor, id);
  if (c.status !== "recommended")
    throw conflict("wrong_state", "There is no recommendation to decide.");
  if (!(await mayDecide(actor, c))) {
    const rec = c.recommendations.at(-1);
    throw forbidden(
      String(rec?.by.id) === String(actor.userId)
        ? "You recommended this outcome; someone else decides it."
        : "This case's decision is for someone else (the OIC, or the division supervisor when the OIC investigated).",
    );
  }
  const rec = /** @type {any} */ (c.recommendations.at(-1));
  const level = await deciderLevel(c);

  if (input.action === "send_back") {
    await change(actor, c, ctx, "cases.sent_back", async () => {
      rec.sentBackAt = new Date();
      rec.sentBackBy = actor.name;
      rec.sentBackReason = input.reason;
      c.status = "investigating";
      c.decideBy = null;
      const summary = `Sent back for more work: ${input.reason}`;
      addEvent(c, "sent_back", actor.name, summary);
      return summary;
    });
    return getCase(actor, id);
  }

  const outcome =
    input.action === "change"
      ? await buildOutcome(c, { ...input, justification: input.reason }, actor)
      : rec;
  await change(actor, c, ctx, "cases.decided", async (session) => {
    if (c.decision) c.decisions.push(c.decision);
    c.decision = {
      outcome,
      kind: input.action === "change" ? "changed" : "approved",
      reason: input.action === "change" ? input.reason : null,
      level,
      by: { id: actor.userId, name: actor.name },
      at: new Date(),
    };
    if (outcome.offenceCodes?.length) c.facts.offenceCodes = outcome.offenceCodes;
    c.decideBy = null;
    c.status = "decided";
    let summary =
      input.action === "change"
        ? `Decided ${say(outcome.outcome)} instead of ${say(rec.outcome)}: ${input.reason}`
        : `Approved ${say(outcome.outcome)}`;
    addEvent(c, "decided", actor.name, summary);
    if (outcome.outcome === "no_further_action") {
      endDispatch(c, "closed", null);
      c.status = "closed";
      c.closedReason = `No further action: ${say(outcome.nfaReason ?? "")}`;
      addEvent(c, "closed", actor.name, c.closedReason);
      summary += " — case closed";
    }
    for (const fn of decidedListeners) await fn(session, c);
    return summary;
  });
  return getCase(actor, id);
}

// ── HQ: override, reopen, merge ─────────────────────────────────────────

/**
 * HQ overrides a decision (docs/05 §4, docs/03 §8): the case returns to
 * "recommended" for a new decision; the outcome stops (notices are withdrawn
 * in N4).
 * @param {Actor} actor @param {string} id @param {string} reason @param {RequestContext} ctx
 */
export async function overrideDecision(actor, id, reason, ctx) {
  const c = await loadVisible(actor, id);
  if (!c.decision || !["decided", "closed"].includes(c.status) || c.mergedInto) {
    throw conflict("wrong_state", "There is no decision in force to override.");
  }
  const decideBy = await limitAt("cases.decide", new Date());
  await change(actor, c, ctx, "cases.decision_overridden", async (session) => {
    const d = /** @type {any} */ (c.decision);
    d.overriddenAt = new Date();
    d.overriddenBy = actor.name;
    d.overrideReason = reason;
    c.decisions.push(d);
    c.decision = null;
    c.status = "recommended";
    c.closedReason = null;
    c.decideBy = decideBy;
    const summary = `Decision overridden by HQ: ${reason}`;
    addEvent(c, "decision_overridden", actor.name, summary);
    for (const fn of overriddenListeners) await fn(session, c, actor.name, reason);
    return summary;
  });
  return getCase(actor, id);
}

/**
 * HQ reopens a closed case (docs/03 C5, D03-7): back to "investigating";
 * finished outcomes stay as they are.
 * @param {Actor} actor @param {string} id @param {string} reason @param {RequestContext} ctx
 */
export async function reopenCase(actor, id, reason, ctx) {
  const c = await loadVisible(actor, id);
  if (c.status !== "closed" || c.mergedInto)
    throw conflict("wrong_state", "Only a closed case can be reopened.");
  if (!c.stationId)
    throw conflict("no_station", "This case never reached a station; dispatch it instead.");
  await change(actor, c, ctx, "cases.reopened", async () => {
    const last = c.dispatches.at(-1);
    if (last && last.endReason === "closed") {
      last.endedAt = null;
      last.endReason = null;
    }
    c.status = "investigating";
    c.closedReason = null;
    const summary = `Reopened by HQ: ${reason}`;
    addEvent(c, "reopened", actor.name, summary);
    return summary;
  });
  return getCase(actor, id);
}

/**
 * HQ merges two cases that describe the same incident (docs/03 §7): neither
 * may be decided. This case closes as "merged into" the other, which takes
 * its reports, evidence, statements and notes.
 * @param {Actor} actor @param {string} id @param {{ intoCaseNumber: string, reason: string }} input @param {RequestContext} ctx
 */
export async function mergeCase(actor, id, input, ctx) {
  const from = await loadVisible(actor, id);
  const into = await Case.findOne({ caseNumber: input.intoCaseNumber.trim().toUpperCase() });
  if (!into) throw validationError({ intoCaseNumber: "No case with that number." });
  if (String(into._id) === String(from._id))
    throw validationError({ intoCaseNumber: "That is this case." });
  const open = ["open", "dispatched", "accepted", "investigating", "recommended", "returned"];
  if (!open.includes(from.status) || !open.includes(into.status)) {
    throw conflict("wrong_state", "Cases can be merged only before either is decided.");
  }
  await change(actor, from, ctx, "cases.merged", async (session) => {
    const fresh = await Case.findById(into._id, null, { session });
    if (!fresh) throw notFound("Case not found.");
    for (const r of from.reportIds)
      if (!fresh.reportIds.some((x) => String(x) === String(r))) fresh.reportIds.push(r);
    fresh.evidenceIds.push(...from.evidenceIds);
    fresh.statements.push(...from.statements);
    fresh.notes.push(
      ...from.notes.map((n) => ({
        .../** @type {any} */ (n.toObject?.() ?? n),
        text: `[${from.caseNumber}] ${n.text}`,
      })),
    );
    addEvent(
      fresh,
      "case_merged_in",
      actor.name,
      `${from.caseNumber} merged into this case: ${input.reason}`,
    );
    await fresh.save({ session });

    endDispatch(from, "closed", null);
    from.mergedInto = { id: fresh._id, caseNumber: fresh.caseNumber };
    from.status = "closed";
    from.closedReason = `Merged into ${fresh.caseNumber}`;
    addEvent(from, "merged", actor.name, `Merged into ${fresh.caseNumber}: ${input.reason}`);
    for (const fn of mergedListeners) await fn(session, from, fresh);
    return `Merged into ${fresh.caseNumber}: ${input.reason}`;
  });
  return getCase(actor, String(into._id));
}

/** @type {((session: import("mongoose").ClientSession, c: CaseDocument, by: string, reason: string) => Promise<void>)[]} */
const overriddenListeners = [];
/**
 * Called when HQ overrides a decision, in the same transaction — the
 * notices module withdraws the running notice (docs/05 §4).
 * @param {(session: import("mongoose").ClientSession, c: CaseDocument, by: string, reason: string) => Promise<void>} fn
 */
export function onDecisionOverridden(fn) {
  overriddenListeners.push(fn);
}

/**
 * Closes a decided case whose outcome has finished (docs/03 C4) — called by
 * the module that runs the outcome (notices: a warning delivered, a notice
 * paid or withdrawn).
 * @param {import("mongoose").ClientSession} session @param {any} caseId @param {string} by @param {string} reason
 */
export async function closeAfterOutcome(session, caseId, by, reason) {
  const c = await Case.findById(caseId, null, { session });
  if (!c || c.status !== "decided") return;
  endDispatch(c, "closed", null);
  c.status = "closed";
  c.closedReason = reason;
  addEvent(c, "closed", by, reason);
  await c.save({ session });
}

/**
 * An upheld dispute sends the case back for a new decision (docs/05 §6.3):
 * like an HQ override, the decision is set aside with the reason; the
 * notice itself is withdrawn by the notices module.
 * @param {import("mongoose").ClientSession} session @param {any} caseId @param {string} by @param {string} reason
 */
export async function reconsiderAfterDispute(session, caseId, by, reason) {
  const c = await Case.findById(caseId, null, { session });
  if (!c?.decision || !["decided", "closed"].includes(c.status)) return;
  const d = /** @type {any} */ (c.decision);
  d.overriddenAt = new Date();
  d.overriddenBy = by;
  d.overrideReason = `Dispute upheld: ${reason}`;
  c.decisions.push(d);
  c.decision = null;
  c.status = "recommended";
  c.closedReason = null;
  c.decideBy = await limitAt("cases.decide", new Date());
  addEvent(c, "decision_overridden", by, `Dispute upheld: ${reason}`);
  await c.save({ session });
}

/**
 * The owner named the driver and the station accepted it (docs/05 §6.2):
 * the case records the driver, named by the owner.
 * @param {import("mongoose").ClientSession} session @param {any} caseId
 * @param {{ _id: any, name: string }} person @param {string} by
 */
export async function recordNamedDriver(session, caseId, person, by) {
  const c = await Case.findById(caseId, null, { session });
  if (!c) return;
  c.driver = { id: person._id, name: person.name, basis: "named_by_owner", note: null };
  addEvent(c, "driver_set", by, `Driver named by the owner: ${person.name}`);
  await c.save({ session });
}

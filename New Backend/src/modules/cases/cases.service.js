// Cases: dispatch, accept and return, the investigating officer, notes —
// docs/03. Every change is one transaction with an audit entry. Outcomes
// (recommend, decide) and investigation records join in later slices.

import mongoose from "mongoose";
import { distanceKm } from "#src/core/geo.js";
import { scopeOf } from "#src/core/access/permissions.js";
import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { conflict, forbidden, notFound, validationError } from "#src/core/errors.js";
import { Station } from "../organisation/organisation.model.js";
import { evidenceList } from "../evidence/index.js";
import { provideCaseLinks, vehicleById } from "../registers/index.js";
import { activeCaseOfficerIds, caseOfficersAt } from "../users/index.js";
import { ACTIVE_STATUSES, Case } from "./case.model.js";
import { caseView, caseRowView } from "./cases.views.js";
import { autoPlan, manualPlan } from "./dispatch.js";
import { enforcementHistory, mayDecide, readiness } from "./outcomes.js";
import {
  acceptAtStation,
  addEvent,
  currentDispatch,
  dispatchTo,
  endDispatch,
  workRecorded,
} from "./lifecycle.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */
/** @typedef {{ ip: string | null, userAgent: string | null }} RequestContext */
/** @typedef {import("./case.model.js").CaseDocument} CaseDocument */

const escapeRegex = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** @param {Actor} actor */
const by = (actor) => ({ id: actor.userId, name: actor.name });

/** @type {((session: import("mongoose").ClientSession, c: CaseDocument) => Promise<void>)[]} */
const moveListeners = [];
/**
 * Called whenever a case changes station, in the same transaction — the
 * reports module keeps its reports with their case.
 * @param {(session: import("mongoose").ClientSession, c: CaseDocument) => Promise<void>} fn
 */
export function onCaseMoved(fn) {
  moveListeners.push(fn);
}

/** @typedef {{ id: string, reportNumber: string, status: string, channel: string, receivedAt: string }} ReportSummary */
/** @type {(ids: any[]) => Promise<ReportSummary[]>} */
let reportLookup = async () => [];
/**
 * How the case record lists its reports — provided by the reports module,
 * which depends on cases (not the other way round).
 * @param {(ids: any[]) => Promise<ReportSummary[]>} fn
 */
export function provideReportLookup(fn) {
  reportLookup = fn;
}

/**
 * One audited change to a case, in a transaction.
 * @param {Actor} actor @param {CaseDocument} c @param {RequestContext} ctx @param {string} action
 * @param {(session: import("mongoose").ClientSession) => Promise<string>} apply
 */
export async function change(actor, c, ctx, action, apply) {
  const stationBefore = c.stationId ? String(c.stationId) : null;
  await inTransaction(async (session) => {
    const summary = await apply(session);
    await c.save({ session });
    const stationAfter = c.stationId ? String(c.stationId) : null;
    if (stationAfter !== stationBefore) {
      for (const fn of moveListeners) await fn(session, c);
    }
    await recordAudit(
      {
        actor: { kind: "staff", id: actor.userId, name: actor.name, role: actor.role },
        action,
        summary,
        target: { type: "case", id: String(c._id), label: c.caseNumber },
        source: ctx,
        places: [actor, { stationId: stationBefore }, { stationId: c.stationId }],
      },
      session,
    );
  });
}

// ── Scope ───────────────────────────────────────────────────────────────

/** Stations the user's scope covers, or null for all. @param {Actor} actor @param {string} permission */
async function scopeStations(actor, permission) {
  const scope = scopeOf(actor.role, permission);
  if (scope === "N" || scope === "R") return null;
  if (scope === "S" || scope === "A") return actor.stationId ? [actor.stationId] : [];
  if (scope === "D") return Station.find({ divisionId: actor.divisionId }).distinct("_id");
  throw forbidden();
}

/** Cases the user may see (docs/20 §5.2). @param {Actor} actor */
async function scopeFilter(actor) {
  const stations = await scopeStations(actor, "cases.view");
  return stations ? { stationId: { $in: stations } } : {};
}

/** @param {Actor} actor @param {string} id */
export async function loadVisible(actor, id) {
  if (!mongoose.isValidObjectId(id)) throw notFound("Case not found.");
  const c = await Case.findOne({ _id: id, ...(await scopeFilter(actor)) });
  if (!c) throw notFound("Case not found.");
  return c;
}

/** Whether a station is within the user's reach for a permission. @param {Actor} actor @param {string} permission @param {any} stationId */
async function reaches(actor, permission, stationId) {
  const stations = await scopeStations(actor, permission);
  return stations === null || stations.some((s) => String(s) === String(stationId));
}

// ── Reading ─────────────────────────────────────────────────────────────

/** @param {Actor} actor @param {any} query */
export async function listCases(actor, query) {
  const scope = await scopeStations(actor, "cases.view");
  /** @type {any[]} */
  const and = [scope ? { stationId: { $in: scope } } : {}];
  /** @type {Record<string, () => Promise<any>>} */
  const views = {
    not_dispatched: async () => ({ status: "open" }),
    returned: async () => ({ status: "returned" }),
    awaiting_acceptance: async () => ({ status: "dispatched" }),
    to_accept: async () => ({ status: "dispatched" }),
    needs_officer: async () => ({
      status: { $in: ["accepted", "investigating"] },
      $or: [
        { investigatingOfficer: null },
        { "investigatingOfficer.id": { $nin: await activeCaseOfficerIds(scope) } },
      ],
    }),
    mine: async () => ({
      "investigatingOfficer.id": new mongoose.Types.ObjectId(String(actor.userId)),
      status: { $in: ["accepted", "investigating", "recommended"] },
    }),
    // Recommendations waiting for this user's decision (S2 sets the level).
    to_decide: async () => ({
      status: "recommended",
      decideLevel:
        actor.role === "division_supervisor"
          ? "division"
          : actor.role === "hq_supervisor"
            ? "hq"
            : actor.role === "station_oic"
              ? "oic"
              : "none",
    }),
    active: async () => ({ status: { $in: ACTIVE_STATUSES } }),
    closed: async () => ({ status: { $in: ["decided", "closed"] } }),
    all: async () => ({}),
  };
  and.push(await (views[query.view] ?? views.all)());
  if (query.priority) and.push({ priority: query.priority });
  if (query.stationId && mongoose.isValidObjectId(query.stationId))
    and.push({ stationId: new mongoose.Types.ObjectId(query.stationId) });
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), "i");
    and.push({
      $or: [{ caseNumber: rx }, { "facts.vehicleNumber": rx }, { "facts.address": rx }],
    });
  }
  const filter = { $and: and };
  // Queues: most urgent first, then oldest. Lists: newest first.
  const queue = [
    "not_dispatched",
    "returned",
    "to_accept",
    "awaiting_acceptance",
    "needs_officer",
    "to_decide",
  ];
  const sort = queue.includes(query.view) ? { priority: 1, createdAt: 1 } : { createdAt: -1 };
  const [rows, total] = await Promise.all([
    Case.find(filter)
      .sort(/** @type {any} */ (sort))
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    Case.countDocuments(filter),
  ]);
  const names = await stationNames(rows.map((r) => r.stationId));
  return {
    items: rows.map((r) => caseRowView(r, names)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** @param {any[]} ids */
async function stationNames(ids) {
  const wanted = ids.filter(Boolean);
  if (!wanted.length) return new Map();
  const stations = await Station.find({ _id: { $in: wanted } }, { name: 1 }).lean();
  return new Map(stations.map((s) => [String(s._id), s.name]));
}

/** @param {Actor} actor @param {string} id */
export async function getCase(actor, id) {
  const c = (await loadVisible(actor, id)).toObject();
  const [names, officers, reports, evidence, vehicle] = await Promise.all([
    stationNames([c.stationId]),
    c.stationId ? caseOfficersAt(c.stationId) : Promise.resolve([]),
    reportLookup(c.reportIds),
    evidenceList(c.evidenceIds ?? []),
    c.vehicle ? vehicleById(c.vehicle.id) : Promise.resolve(null),
  ]);
  const officerActive = Boolean(
    c.investigatingOfficer?.id && officers.some((o) => o.id === String(c.investigatingOfficer?.id)),
  );
  const can = await permissionsOn(actor, c);
  const [ready, history] = await Promise.all([
    can.recommend ? readiness(c) : Promise.resolve(null),
    c.vehicle || c.owner || c.driver
      ? enforcementHistory(c)
      : Promise.resolve({ vehicle: 0, person: 0 }),
  ]);
  return caseView(c, {
    readiness: ready,
    // Repeat offender: 3 or more enforcement outcomes in 12 months (docs/04 §7, D04-4).
    repeatOffender: history.vehicle >= 3 || history.person >= 3 ? history : null,
    names,
    officerActive,
    reports,
    evidence,
    vehicleFlags: (vehicle?.flags ?? []).filter((f) => !f.clearedAt).map((f) => f.type),
    // People's names only for roles that may see people (docs/04 §9).
    showPeople: Boolean(scopeOf(actor.role, "persons.view")),
    can,
  });
}

/**
 * What the user may do with the case now — the screens show only these.
 * @param {Actor} actor @param {any} c
 */
async function permissionsOn(actor, c) {
  const own = Boolean(c.stationId) && String(c.stationId) === String(actor.stationId);
  const atStation = ["accepted", "investigating"].includes(c.status);
  const d = c.dispatches?.at(-1);
  const isOfficer = String(c.investigatingOfficer?.id ?? "") === String(actor.userId);
  const dispatchScope = scopeOf(actor.role, "cases.dispatch");
  return {
    dispatch:
      dispatchScope === "N" &&
      ["open", "returned", "dispatched", "accepted", "investigating"].includes(c.status),
    autoDispatch:
      dispatchScope === "N" &&
      !c.disputed &&
      Boolean(c.facts?.location) &&
      ["open", "returned"].includes(c.status),
    accept: Boolean(scopeOf(actor.role, "cases.acceptReturn")) && own && c.status === "dispatched",
    return:
      Boolean(scopeOf(actor.role, "cases.acceptReturn")) &&
      own &&
      (c.status === "dispatched" || (c.status === "accepted" && !c.workStartedAt)) &&
      !(c.disputed && d?.method === "manual") &&
      d?.method !== "station_recorded",
    assignOfficer:
      atStation &&
      Boolean(scopeOf(actor.role, "cases.assignOfficer")) &&
      (await reaches(actor, "cases.assignOfficer", c.stationId)),
    addNote: canNote(actor, c, own, isOfficer),
    // Investigation work: the investigating officer and the OIC (D03-8).
    work: atStation && own && (isOfficer || actor.role === "station_oic"),
    recommend:
      atStation &&
      own &&
      (isOfficer || actor.role === "station_oic") &&
      Boolean(scopeOf(actor.role, "cases.recommend")),
    decide: await mayDecide(actor, c),
    override:
      scopeOf(actor.role, "cases.override") === "N" &&
      Boolean(c.decision) &&
      ["decided", "closed"].includes(c.status) &&
      !c.mergedInto,
    reopen:
      scopeOf(actor.role, "cases.override") === "N" &&
      c.status === "closed" &&
      !c.mergedInto &&
      Boolean(c.stationId),
    merge:
      dispatchScope === "N" &&
      ["open", "dispatched", "accepted", "investigating", "recommended", "returned"].includes(
        c.status,
      ),
  };
}

/**
 * Who may write on a case (docs/03 D03-8): its investigating officer and
 * the OIC at its station; HQ dispatchers and the division supervisor as HQ.
 * @param {Actor} actor @param {any} c @param {boolean} own @param {boolean} isOfficer
 * @returns {"station" | "hq" | null}
 */
function canNote(actor, c, own, isOfficer) {
  if (["decided", "closed"].includes(c.status)) return null;
  if (own && (isOfficer || actor.role === "station_oic")) return "station";
  const dispatch = scopeOf(actor.role, "cases.dispatch");
  if (dispatch === "N" || dispatch === "D") return "hq";
  return null;
}

// ── Dispatch ────────────────────────────────────────────────────────────

/**
 * HQ sends the case to a station (docs/03 §5.2, §5.4): the automatic choice,
 * or a station of its own choosing with a reason. A disputed case is never
 * dispatched automatically.
 * @param {Actor} actor @param {string} id
 * @param {{ mode: "auto" | "manual", stationId?: string, reason?: string }} input
 * @param {RequestContext} ctx
 */
export async function dispatchCase(actor, id, input, ctx) {
  const c = await loadVisible(actor, id);
  if (!["open", "returned", "dispatched", "accepted", "investigating"].includes(c.status)) {
    throw conflict(
      "wrong_state",
      "Once an outcome is recommended, the case stays with its station (HQ override comes later).",
    );
  }
  const returnedBy = c.dispatches.filter((d) => d.endReason === "returned").map((d) => d.stationId);
  let plan;
  if (input.mode === "auto") {
    if (c.disputed) {
      throw conflict(
        "disputed",
        "This case was returned twice (disputed jurisdiction). Choose the station yourself.",
      );
    }
    const current = currentDispatch(c)?.stationId;
    plan = await autoPlan(c.facts, { exclude: [...returnedBy, ...(current ? [current] : [])] });
    if (!plan) {
      throw conflict(
        "no_station",
        c.facts.location
          ? "No other verified station was found. Choose the station yourself."
          : "This case has no map position. Choose the station yourself.",
      );
    }
  } else {
    if (!input.reason) throw validationError({ reason: "Say why you chose this station." });
    plan = await manualPlan(input.stationId, c.facts);
    if (!plan) throw validationError({ stationId: "Choose an active station." });
    if (String(plan.stationId) === String(c.stationId) && c.status !== "returned") {
      throw validationError({ stationId: "The case is already at this station." });
    }
  }
  const chosen = plan;
  await change(actor, c, ctx, "cases.dispatched", async () => {
    const wasAtStation = Boolean(currentDispatch(c));
    endDispatch(c, "redispatched", input.reason ?? null);
    await dispatchTo(c, chosen, actor.name, { reason: input.reason ?? null });
    return `${wasAtStation ? "Re-dispatched" : "Dispatched"} to ${chosen.stationName} (${chosen.method})${input.reason ? `: ${input.reason}` : ""}`;
  });
  return getCase(actor, id);
}

// ── At the station ──────────────────────────────────────────────────────

/** @param {Actor} actor @param {CaseDocument} c */
function assertOwnStation(actor, c) {
  if (!c.stationId || String(c.stationId) !== String(actor.stationId)) {
    throw forbidden("This case isn't at your station.");
  }
}

/**
 * The station takes the case; the person accepting becomes its
 * investigating officer (docs/03 §5.3, §6).
 * @param {Actor} actor @param {string} id @param {RequestContext} ctx
 */
export async function acceptCase(actor, id, ctx) {
  const c = await loadVisible(actor, id);
  assertOwnStation(actor, c);
  if (c.status !== "dispatched")
    throw conflict("wrong_state", "This case isn't waiting to be accepted.");
  await change(actor, c, ctx, "cases.accepted", async () => {
    await acceptAtStation(c, by(actor), by(actor));
    return `Accepted at the station; investigating officer ${actor.name}`;
  });
  return getCase(actor, id);
}

/**
 * The station sends the case back as not theirs (docs/03 §5.3): before any
 * work, with a reason. The second return makes it "disputed": HQ must then
 * choose, and the station can't return HQ's choice again.
 * @param {Actor} actor @param {string} id @param {string} reason @param {RequestContext} ctx
 */
export async function returnCase(actor, id, reason, ctx) {
  const c = await loadVisible(actor, id);
  assertOwnStation(actor, c);
  if (!(c.status === "dispatched" || (c.status === "accepted" && !c.workStartedAt))) {
    throw conflict("wrong_state", "A case can be returned only before work is recorded on it.");
  }
  if (currentDispatch(c)?.method === "station_recorded") {
    throw conflict("own_case", "Your station recorded this case; it can't be returned to HQ.");
  }
  if (c.disputed && currentDispatch(c)?.method === "manual") {
    throw conflict(
      "disputed",
      "HQ chose your station after this case was disputed. Add a note to HQ instead of returning it.",
    );
  }
  await change(actor, c, ctx, "cases.returned", async () => {
    endDispatch(c, "returned", reason);
    c.returnCount += 1;
    c.status = "returned";
    c.stationId = null;
    c.investigatingOfficer = null;
    c.assignOfficerBy = null;
    c.recommendBy = null;
    addEvent(c, "returned", actor.name, reason);
    if (c.returnCount >= 2 && !c.disputed) {
      c.disputed = true;
      addEvent(c, "disputed", "System", "Returned twice: HQ must choose the station");
    }
    return `Returned to HQ: ${reason}${c.disputed ? " (disputed jurisdiction)" : ""}`;
  });
  // The station no longer holds the case: answer with its summary, not the record.
  return caseRowView(c.toObject(), new Map());
}

/**
 * Sets the investigating officer — an active officer or the OIC at the
 * case's station (docs/03 §6).
 * @param {Actor} actor @param {string} id @param {{ officerId: string, note?: string }} input @param {RequestContext} ctx
 */
export async function assignOfficer(actor, id, input, ctx) {
  const c = await loadVisible(actor, id);
  if (!["accepted", "investigating"].includes(c.status))
    throw conflict("wrong_state", "An officer can be assigned while the case is being worked.");
  if (!(await reaches(actor, "cases.assignOfficer", c.stationId))) throw forbidden();
  const officer = (await caseOfficersAt(/** @type {any} */ (c.stationId))).find(
    (o) => o.id === input.officerId,
  );
  if (!officer) {
    throw validationError({ officerId: "Choose an active officer at the case's station." });
  }
  if (String(c.investigatingOfficer?.id ?? "") === officer.id) {
    throw validationError({ officerId: `${officer.name} is already the investigating officer.` });
  }
  await change(actor, c, ctx, "cases.officer_assigned", async () => {
    const before = c.investigatingOfficer?.name ?? null;
    c.investigatingOfficer = { id: new mongoose.Types.ObjectId(officer.id), name: officer.name };
    c.assignOfficerBy = null;
    const summary = `Investigating officer ${before ? `${before} → ` : ""}${officer.name}${input.note ? `: ${input.note}` : ""}`;
    addEvent(c, "officer_assigned", actor.name, summary);
    return summary;
  });
  return getCase(actor, id);
}

/**
 * A note on the case. From the investigating officer or the OIC it is work
 * on the case (C2); from HQ it is a message to the station.
 * @param {Actor} actor @param {string} id @param {string} text @param {RequestContext} ctx
 */
export async function addNote(actor, id, text, ctx) {
  const c = await loadVisible(actor, id);
  const own = Boolean(c.stationId) && String(c.stationId) === String(actor.stationId);
  const isOfficer = String(c.investigatingOfficer?.id ?? "") === String(actor.userId);
  const side = canNote(actor, c, own, isOfficer);
  if (!side) {
    throw forbidden(
      "Only the investigating officer, the station's OIC and HQ can write on this case.",
    );
  }
  if (side === "hq" && !(await reaches(actor, "cases.dispatch", c.stationId))) throw forbidden();
  await change(actor, c, ctx, "cases.note_added", async () => {
    c.notes.push({ at: new Date(), by: actor.name, byId: actor.userId, side, text });
    if (side === "station" && ["accepted", "investigating"].includes(c.status)) {
      workRecorded(c, actor.name);
    }
    return `Note (${side === "hq" ? "HQ" : "station"}): ${text.slice(0, 120)}`;
  });
  return getCase(actor, id);
}

/** Officers who can be assigned to the case. @param {Actor} actor @param {string} id */
export async function officersFor(actor, id) {
  const c = await loadVisible(actor, id);
  if (!c.stationId || !(await reaches(actor, "cases.assignOfficer", c.stationId)))
    throw forbidden();
  return { items: await caseOfficersAt(c.stationId) };
}

/**
 * Stations HQ can choose for a manual dispatch: active ones, nearest to the
 * case first, with the warnings a choice would carry.
 * @param {Actor} actor @param {string} id @param {string | undefined} q
 */
export async function stationChoices(actor, id, q) {
  const c = await loadVisible(actor, id);
  const [lng, lat] = c.facts.location?.coordinates ?? [];
  const stations = await Station.find(
    { isActive: true, ...(q ? { name: new RegExp(escapeRegex(q), "i") } : {}) },
    { name: 1, location: 1, verified: 1 },
  ).lean();
  const rows = stations.map((s) => {
    const [slng, slat] = s.location?.coordinates ?? [];
    const distance =
      lat !== undefined && lng !== undefined && slat !== undefined && slng !== undefined
        ? Math.round(distanceKm({ lat, lng }, { lat: slat, lng: slng }) * 10) / 10
        : null;
    return {
      id: String(s._id),
      name: s.name,
      verified: Boolean(s.verified),
      distanceKm: distance,
      current: String(s._id) === String(c.stationId),
    };
  });
  rows.sort(
    (a, b) =>
      (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.name.localeCompare(b.name),
  );
  return { items: rows.slice(0, 20) };
}

// The registers find a person's or vehicle's cases through this module.
/** @param {any[]} rows @param {(c: any) => string} roleOf */
const linksOf = (rows, roleOf) =>
  rows.map((c) => ({
    caseId: String(c._id),
    caseNumber: c.caseNumber,
    status: c.status,
    stationId: c.stationId ? String(c.stationId) : null,
    officerId: c.investigatingOfficer?.id ? String(c.investigatingOfficer.id) : null,
    role: roleOf(c),
    occurredAt: c.facts.occurredAt.toISOString(),
  }));
const LINK_FIELDS = {
  caseNumber: 1,
  status: 1,
  stationId: 1,
  investigatingOfficer: 1,
  facts: 1,
  owner: 1,
  driver: 1,
};
provideCaseLinks({
  person: async (personId) => {
    const id = new mongoose.Types.ObjectId(String(personId));
    const rows = await Case.find(
      { $or: [{ "owner.id": id }, { "driver.id": id }, { "statements.personId": id }] },
      LINK_FIELDS,
    )
      .sort({ createdAt: -1 })
      .lean();
    return linksOf(rows, (c) =>
      String(c.owner?.id) === String(id)
        ? "owner"
        : String(c.driver?.id) === String(id)
          ? "driver"
          : "statement",
    );
  },
  vehicle: async (vehicleId) => {
    const rows = await Case.find(
      { "vehicle.id": new mongoose.Types.ObjectId(String(vehicleId)) },
      LINK_FIELDS,
    )
      .sort({ createdAt: -1 })
      .lean();
    return linksOf(rows, () => "vehicle");
  },
});

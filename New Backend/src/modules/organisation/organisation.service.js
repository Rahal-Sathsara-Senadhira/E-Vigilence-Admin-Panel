// Divisions and police stations — docs/03 §3, docs/20 §5.4.
//
// Every change runs in a transaction with its audit entry. A station can't
// be deactivated while it still has active staff: move or deactivate them
// first, so no one is left attached to a closed station.

import mongoose from "mongoose";
import { scopeOf } from "#src/core/access/permissions.js";
import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { conflict, forbidden, notFound, validationError } from "#src/core/errors.js";
import { readArea, toPoint } from "#src/core/geo.js";
import { activeCaseCount } from "../cases/index.js";
import { activeStaffByRole, nameOf } from "../users/index.js";
import { Division, Station } from "./organisation.model.js";
import { reaches, stationFilter } from "./organisation.policy.js";
import { divisionView, stationListView, stationView } from "./organisation.views.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */
/** @typedef {{ ip: string | null, userAgent: string | null }} RequestContext */

const escapeRegex = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** @param {Actor} actor */
const auditActor = (actor) => ({
  kind: /** @type {const} */ ("staff"),
  id: actor.userId,
  name: actor.name,
  role: actor.role,
});

/** @returns {Promise<Map<string, string>>} */
async function divisionNames() {
  const all = await Division.find({}, { name: 1 }).lean();
  return new Map(all.map((d) => [String(d._id), d.name]));
}

/** @param {any} input */
async function assertActiveDivision(input) {
  const d = await Division.findById(input, { isActive: 1 }).lean();
  if (!d?.isActive) throw validationError({ divisionId: "Choose an active division." });
  return d._id;
}

// ── Divisions ───────────────────────────────────────────────────────────

/** Divisions the user can see, with station counts. @param {Actor} actor */
export async function listDivisions(actor) {
  const scope = scopeOf(actor.role, "stations.view");
  /** @type {any} */
  let filter = {};
  if (scope === "D") filter = { _id: actor.divisionId };
  if (scope === "S") {
    const own = await Station.findById(actor.stationId, { divisionId: 1 }).lean();
    filter = { _id: own?.divisionId ?? null };
  }
  const [divisions, counts] = await Promise.all([
    Division.find(filter).sort({ name: 1 }).lean(),
    Station.aggregate([
      { $match: { isActive: true, divisionId: { $ne: null } } },
      {
        $group: {
          _id: "$divisionId",
          stations: { $sum: 1 },
          verified: { $sum: { $cond: ["$verified", 1, 0] } },
        },
      },
    ]),
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c]));
  return divisions.map((d) => divisionView(d, byId.get(String(d._id))));
}

/** @param {Actor} actor @param {{ name: string, code: string, range?: string, province?: string }} input @param {RequestContext} ctx */
export async function createDivision(actor, input, ctx) {
  await assertUniqueDivision(input);
  const division = await inTransaction(async (session) => {
    const [created] = await Division.create([{ ...input }], { session });
    const d = /** @type {NonNullable<typeof created>} */ (created);
    await recordAudit(
      {
        actor: auditActor(actor),
        action: "divisions.created",
        summary: `Created the ${d.name} division`,
        target: { type: "division", id: String(d._id), label: d.name },
        source: ctx,
        places: [actor, { divisionId: d._id }],
      },
      session,
    );
    return d;
  });
  return divisionView(division);
}

/** @param {Actor} actor @param {string} id @param {{ name: string, code: string, range?: string, province?: string }} input @param {RequestContext} ctx */
export async function updateDivision(actor, id, input, ctx) {
  if (!mongoose.isValidObjectId(id)) throw notFound("Division not found.");
  const division = await Division.findById(id);
  if (!division) throw notFound("Division not found.");
  await assertUniqueDivision(input, division._id);
  await inTransaction(async (session) => {
    division.name = input.name;
    division.code = input.code;
    division.range = input.range ?? null;
    division.province = input.province ?? null;
    await division.save({ session });
    await recordAudit(
      {
        actor: auditActor(actor),
        action: "divisions.updated",
        summary: `Updated the ${division.name} division`,
        target: { type: "division", id, label: division.name },
        source: ctx,
        places: [actor, { divisionId: division._id }],
      },
      session,
    );
  });
  return divisionView(division);
}

/** @param {{ name: string, code: string }} input @param {any} [exceptId] */
async function assertUniqueDivision(input, exceptId) {
  const others = exceptId ? { _id: { $ne: exceptId } } : {};
  /** @type {Record<string, string>} */
  const fields = {};
  if (await Division.exists({ ...others, name: input.name }))
    fields.name = "Another division has this name.";
  if (await Division.exists({ ...others, code: input.code }))
    fields.code = "Another division has this code.";
  if (Object.keys(fields).length) throw validationError(fields);
}

// ── Stations: reading ───────────────────────────────────────────────────

/**
 * @param {Actor} actor
 * @param {{ q?: string, divisionId?: string, status?: string, page: number, pageSize: number }} query
 */
export async function listStations(actor, query) {
  const scoped = /** @type {any} */ (stationFilter(actor, "stations.view"));
  /** @type {any[]} */
  const and = [scoped];
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), "i");
    and.push({ $or: [{ name: rx }, { code: rx }] });
  }
  if (query.divisionId) {
    and.push({
      $or: [
        { divisionId: query.divisionId },
        { divisionId: null, suggestedDivisionId: query.divisionId },
      ],
    });
  }
  if (query.status === "verified") and.push({ isActive: true, verified: true });
  if (query.status === "unverified") and.push({ isActive: true, verified: false });
  if (query.status === "inactive") and.push({ isActive: false });
  const filter = { $and: and };

  const [rows, total, unverified, names] = await Promise.all([
    Station.find(filter, { area: 0 })
      .sort({ name: 1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    Station.countDocuments(filter),
    Station.countDocuments({ $and: [scoped, { isActive: true, verified: false }] }),
    divisionNames(),
  ]);
  return {
    items: rows.map((s) => stationListView(s, names)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    unverified,
  };
}

/** Every station in reach with a position — for the map. @param {Actor} actor */
export async function stationsForMap(actor) {
  const rows = await Station.find(
    { ...stationFilter(actor, "stations.view"), location: { $ne: null } },
    { name: 1, location: 1, verified: 1, isActive: 1, divisionId: 1 },
  ).lean();
  return rows.map((s) => ({
    id: String(s._id),
    name: s.name,
    lat: s.location?.coordinates[1],
    lng: s.location?.coordinates[0],
    status: !s.isActive ? "inactive" : s.verified ? "verified" : "unverified",
  }));
}

/** @param {Actor} actor @param {string} id */
async function loadVisible(actor, id) {
  if (!mongoose.isValidObjectId(id)) throw notFound("Station not found.");
  const station = await Station.findById(id);
  if (!station || !reaches(actor, "stations.view", station)) throw notFound("Station not found.");
  return station;
}

/** @param {Actor} actor @param {any} station */
async function viewOf(actor, station) {
  const manage = reaches(actor, "stations.manage", station);
  const [names, staff, verifiedByName] = await Promise.all([
    divisionNames(),
    activeStaffByRole(station._id),
    nameOf(station.verifiedBy),
  ]);
  return stationView(
    station,
    { divisionNames: names, staff, verifiedByName },
    {
      edit: manage,
      editContact: manage || reaches(actor, "stations.editContact", station),
      verify: manage && station.isActive && !station.verified,
      editArea: manage,
      deactivate: manage && station.isActive,
      reactivate: manage && !station.isActive,
    },
  );
}

/** @param {Actor} actor @param {string} id */
export async function getStation(actor, id) {
  return viewOf(actor, await loadVisible(actor, id));
}

// ── Stations: changes ───────────────────────────────────────────────────

/**
 * Runs a station change in a transaction with its audit entry.
 * @param {Actor} actor @param {string} id @param {RequestContext} ctx
 * @param {"stations.manage" | "stations.editContact"} permission
 * @param {string} action
 * @param {(station: import("./organisation.model.js").StationDocument, session: import("mongoose").ClientSession) => Promise<string>} apply
 */
async function change(actor, id, ctx, permission, action, apply) {
  const station = await loadVisible(actor, id);
  if (!reaches(actor, permission, station) && !reaches(actor, "stations.manage", station)) {
    throw forbidden("Your role can't change this station.");
  }
  await inTransaction(async (session) => {
    const summary = await apply(station, session);
    await station.save({ session });
    await recordAudit(
      {
        actor: auditActor(actor),
        action,
        summary,
        target: { type: "station", id: String(station._id), label: station.name },
        source: ctx,
        places: [actor, { stationId: station._id, divisionId: station.divisionId }],
      },
      session,
    );
  });
  return viewOf(actor, station);
}

/** "Mt. Lavinia Police Station" → "MT-LAVINIA". @param {string} name */
const codeFromName = (name) =>
  name
    .replace(/police station/gi, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);

/**
 * HQ adds a station. It is verified at once: the administrator entered the
 * division and position themselves.
 * @param {Actor} actor
 * @param {{ name: string, code?: string, divisionId: string, lat: number, lng: number, address?: string, phone?: string, email?: string }} input
 * @param {RequestContext} ctx
 */
export async function createStation(actor, input, ctx) {
  const divisionId = await assertActiveDivision(input.divisionId);
  let code = input.code ?? codeFromName(input.name);
  if (input.code && (await Station.exists({ code })))
    throw validationError({ code: "Another station has this code." });
  while (await Station.exists({ code })) code = `${code}-2`;
  const station = await inTransaction(async (session) => {
    const [created] = await Station.create(
      [
        {
          name: input.name,
          code,
          divisionId,
          location: toPoint(input.lat, input.lng),
          address: input.address ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          source: "manual",
          verified: true,
          verifiedAt: new Date(),
          verifiedBy: actor.userId,
        },
      ],
      { session },
    );
    const s = /** @type {NonNullable<typeof created>} */ (created);
    await recordAudit(
      {
        actor: auditActor(actor),
        action: "stations.created",
        summary: `Added ${s.name}`,
        target: { type: "station", id: String(s._id), label: s.name },
        source: ctx,
        places: [actor, { stationId: s._id, divisionId: s.divisionId }],
      },
      session,
    );
    return s;
  });
  return viewOf(actor, station);
}

/**
 * @param {Actor} actor @param {string} id
 * @param {{ name: string, code?: string, divisionId: string, lat: number, lng: number, address?: string, phone?: string, email?: string }} input
 * @param {RequestContext} ctx
 */
export async function updateStation(actor, id, input, ctx) {
  const divisionId = await assertActiveDivision(input.divisionId);
  if (input.code && (await Station.exists({ code: input.code, _id: { $ne: id } }))) {
    throw validationError({ code: "Another station has this code." });
  }
  return change(actor, id, ctx, "stations.manage", "stations.updated", async (s) => {
    const moved = String(s.divisionId ?? "") !== String(divisionId);
    s.name = input.name;
    if (input.code) s.code = input.code;
    s.divisionId = divisionId;
    s.suggestedDivisionId = null;
    s.location = /** @type {any} */ (toPoint(input.lat, input.lng));
    s.address = input.address ?? null;
    s.phone = input.phone ?? null;
    s.email = input.email ?? null;
    return moved ? "Updated details and moved to another division" : "Updated details";
  });
}

/** Contact details only — the OIC's own station, or a division's stations. @param {Actor} actor @param {string} id @param {{ address?: string, phone?: string, email?: string }} input @param {RequestContext} ctx */
export function updateContact(actor, id, input, ctx) {
  return change(actor, id, ctx, "stations.editContact", "stations.contact_updated", async (s) => {
    s.address = input.address ?? null;
    s.phone = input.phone ?? null;
    s.email = input.email ?? null;
    return "Updated contact details";
  });
}

/** HQ confirms division and position. @param {Actor} actor @param {string} id @param {{ divisionId: string, lat: number, lng: number }} input @param {RequestContext} ctx */
export async function verifyStation(actor, id, input, ctx) {
  const divisionId = await assertActiveDivision(input.divisionId);
  return change(actor, id, ctx, "stations.manage", "stations.verified", async (s) => {
    if (!s.isActive) throw conflict("inactive", "Reactivate the station first.");
    if (s.verified) throw conflict("already_verified", "This station is already verified.");
    s.divisionId = divisionId;
    s.suggestedDivisionId = null;
    s.location = /** @type {any} */ (toPoint(input.lat, input.lng));
    s.verified = true;
    s.verifiedAt = new Date();
    s.verifiedBy = actor.userId;
    return "Verified division and map position";
  });
}

/** Set or clear the area of responsibility. @param {Actor} actor @param {string} id @param {any} input @param {RequestContext} ctx */
export async function setArea(actor, id, input, ctx) {
  if (input === null) {
    return change(actor, id, ctx, "stations.manage", "stations.area_cleared", async (s) => {
      s.area = null;
      return "Removed the area";
    });
  }
  const { area, problem } = readArea(input);
  if (problem) throw validationError({ area: problem });
  try {
    return await change(actor, id, ctx, "stations.manage", "stations.area_set", async (s) => {
      s.area = /** @type {any} */ (area);
      return "Set the area of responsibility";
    });
  } catch (err) {
    // MongoDB refuses self-crossing or otherwise invalid shapes.
    if (/** @type {any} */ (err)?.code === 16755) {
      throw validationError({ area: "The outline crosses itself. Check the area and try again." });
    }
    throw err;
  }
}

/** @param {Actor} actor @param {string} id @param {string} reason @param {RequestContext} ctx */
export function deactivateStation(actor, id, reason, ctx) {
  return change(actor, id, ctx, "stations.manage", "stations.deactivated", async (s) => {
    if (!s.isActive) throw conflict("already_inactive", "This station is already inactive.");
    const staff = await activeStaffByRole(s._id);
    const people = staff.reduce((n, r) => n + r.count, 0);
    if (people > 0) {
      throw conflict(
        "has_staff",
        `${people} active account${people === 1 ? " is" : "s are"} still at this station. Move or deactivate them first.`,
      );
    }
    const cases = await activeCaseCount(s._id);
    if (cases > 0) {
      throw conflict(
        "has_cases",
        `${cases} case${cases === 1 ? " is" : "s are"} still being worked at this station. Re-dispatch ${cases === 1 ? "it" : "them"} first.`,
      );
    }
    s.isActive = false;
    return `Deactivated: ${reason}`;
  });
}

/** @param {Actor} actor @param {string} id @param {RequestContext} ctx */
export function reactivateStation(actor, id, ctx) {
  return change(actor, id, ctx, "stations.manage", "stations.reactivated", async (s) => {
    if (s.isActive) throw conflict("already_active", "This station is already active.");
    s.isActive = true;
    return "Reactivated";
  });
}

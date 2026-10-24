// People and vehicles — docs/04. A person is visible to HQ supervisors and
// auditors, and to the station handling a case that involves them (D04-7);
// every view of a person's record is logged (docs/10). Lists and searches
// show identifiers masked (docs/10 §5.3).

import mongoose from "mongoose";
import { scopeOf } from "#src/core/access/permissions.js";
import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { AppError, forbidden, notFound, validationError } from "#src/core/errors.js";
import { mask, normalizeNic, normalizePhone } from "#src/core/srilanka.js";
import { Station } from "../organisation/organisation.model.js";
import { Person, Vehicle } from "./registers.model.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */
/** @typedef {{ ip: string | null, userAgent: string | null }} RequestContext */

/**
 * @typedef {object} CaseLink
 * @property {string} caseId
 * @property {string} caseNumber
 * @property {string} status
 * @property {string | null} stationId
 * @property {string | null} officerId
 * @property {string} role   owner · driver · statement
 * @property {string} occurredAt
 */

/** @type {(personId: any) => Promise<CaseLink[]>} */
let casesOfPerson = async () => [];
/** @type {(vehicleId: any) => Promise<CaseLink[]>} */
let casesOfVehicle = async () => [];
/**
 * How a person's or vehicle's cases are found — provided by the cases
 * module, which depends on the registers (not the other way round).
 * @param {{ person: typeof casesOfPerson, vehicle: typeof casesOfVehicle }} fns
 */
export function provideCaseLinks(fns) {
  casesOfPerson = fns.person;
  casesOfVehicle = fns.vehicle;
}

/** @param {Actor} actor */
const auditActor = (actor) => ({
  kind: /** @type {const} */ ("staff"),
  id: actor.userId,
  name: actor.name,
  role: actor.role,
});

/** "12 Main Street, Kandy" → "Kandy" — lists show the town only (docs/10 §5.3). @param {string | null | undefined} a */
const townOf = (a) => (a ? (a.split(",").at(-1)?.trim() ?? null) : null);

/** @param {any} p */
export const personRowView = (p) => ({
  id: String(p._id),
  type: p.type,
  name: p.name,
  nic: p.nic ? mask(p.nic) : null,
  licenceNumber: p.licenceNumber ? mask(p.licenceNumber) : null,
  businessRegNo: p.businessRegNo ? mask(p.businessRegNo) : null,
  town: townOf(p.address),
  hasAddress: Boolean(p.address),
});

/** @param {any} p */
const personFullView = (p) => ({
  id: String(p._id),
  type: p.type,
  name: p.name,
  nic: p.nic ?? null,
  licenceNumber: p.licenceNumber ?? null,
  businessRegNo: p.businessRegNo ?? null,
  address: p.address ?? null,
  phone: p.phone ?? null,
  createdBy: p.createdBy,
  createdAt: p.createdAt.toISOString(),
  changes: (p.changes ?? []).map((/** @type {any} */ c) => ({
    at: c.at.toISOString(),
    by: c.by,
    fields: c.fields,
    reason: c.reason,
  })),
});

// ── Who may see a person ────────────────────────────────────────────────

/**
 * Whether the user may open this person's record: HQ (N), the auditor (R),
 * and staff of a station handling one of their cases (S; D for the
 * division; A only for cases assigned to the officer).
 * @param {Actor} actor @param {CaseLink[]} links
 */
async function mayOpen(actor, links) {
  const scope = scopeOf(actor.role, "persons.view");
  if (scope === "N" || scope === "R") return true;
  if (scope === "S") return links.some((l) => l.stationId === String(actor.stationId));
  if (scope === "A") return links.some((l) => l.officerId === String(actor.userId));
  if (scope === "D") {
    const stations = (await Station.find({ divisionId: actor.divisionId }).distinct("_id")).map(
      String,
    );
    return links.some((l) => l.stationId && stations.includes(l.stationId));
  }
  return false;
}

/**
 * Investigators may open a person they are about to link (they just found
 * or created them); after that, access follows the cases (above).
 * @param {Actor} actor
 */
const isInvestigator = (actor) => Boolean(scopeOf(actor.role, "cases.investigate"));

// ── People ──────────────────────────────────────────────────────────────

/**
 * Finds people before one is created (P1). Exact identifiers for everyone
 * with access; names only for national roles — no browsing by name at
 * stations. Results are masked.
 * @param {Actor} actor @param {{ nic?: string, licence?: string, brn?: string, q?: string }} query
 */
export async function searchPersons(actor, query) {
  /** @type {any[]} */
  const or = [];
  const nic = query.nic ? normalizeNic(query.nic) : null;
  if (query.nic && !nic) throw validationError({ nic: "Enter a valid NIC number." });
  if (nic) or.push({ nic });
  if (query.licence) or.push({ licenceNumber: query.licence.trim().toUpperCase() });
  if (query.brn) or.push({ businessRegNo: query.brn.trim().toUpperCase() });
  const scope = scopeOf(actor.role, "persons.view");
  if (query.q && (scope === "N" || scope === "R")) or.push({ $text: { $search: query.q } });
  if (!or.length) return { items: [] };
  const rows = await Person.find({ $or: or }).limit(20).lean();
  return { items: rows.map(personRowView) };
}

/**
 * A new person — refused when the NIC, licence or business registration
 * number is already recorded, pointing at that record (P1).
 * @param {Actor} actor @param {any} input @param {RequestContext} ctx
 */
export async function createPerson(actor, input, ctx) {
  const data = cleanPerson(input);
  await refuseDuplicate(data, null);
  /** @type {any} */
  let created;
  await inTransaction(async (session) => {
    [created] = await Person.create([{ ...data, createdBy: actor.name }], { session });
    await recordAudit(
      {
        actor: auditActor(actor),
        action: "persons.created",
        summary: `Added ${data.type === "organisation" ? "an organisation" : "a person"} to the register`,
        target: { type: "person", id: String(created._id), label: data.name },
        source: ctx,
        places: [actor],
      },
      session,
    );
  });
  return personFullView(created);
}

/** @param {any} input */
function cleanPerson(input) {
  /** @type {any} */
  const data = { type: input.type, name: input.name.trim() };
  if (input.nic !== undefined) {
    data.nic = input.nic ? normalizeNic(input.nic) : null;
    if (input.nic && !data.nic)
      throw validationError({ nic: "Enter a valid NIC: 9 digits and V or X, or 12 digits." });
  }
  if (input.licenceNumber !== undefined)
    data.licenceNumber = input.licenceNumber ? input.licenceNumber.trim().toUpperCase() : null;
  if (input.businessRegNo !== undefined)
    data.businessRegNo = input.businessRegNo ? input.businessRegNo.trim().toUpperCase() : null;
  if (input.address !== undefined) data.address = input.address?.trim() || null;
  if (input.phone !== undefined) {
    data.phone = input.phone ? normalizePhone(input.phone) : null;
    if (input.phone && !data.phone)
      throw validationError({ phone: "Enter a Sri Lankan phone number." });
  }
  if (data.type === "organisation") data.nic = null;
  return data;
}

/** @param {any} data @param {any} exceptId */
async function refuseDuplicate(data, exceptId) {
  for (const [field, label] of /** @type {const} */ ([
    ["nic", "NIC"],
    ["licenceNumber", "licence number"],
    ["businessRegNo", "business registration number"],
  ])) {
    if (!data[field]) continue;
    const match = await Person.findOne(
      { [field]: data[field], ...(exceptId ? { _id: { $ne: exceptId } } : {}) },
      { name: 1 },
    ).lean();
    if (match) {
      throw new AppError(
        409,
        "duplicate_person",
        `This ${label} is already recorded for ${match.name}. Use that record.`,
        {
          [field]: `Already recorded for ${match.name}.`,
          matchId: String(match._id),
          matchName: match.name,
        },
      );
    }
  }
}

/**
 * A person's record with their cases — logged, as every view is (docs/10).
 * @param {Actor} actor @param {string} id @param {RequestContext} ctx
 */
export async function getPerson(actor, id, ctx) {
  if (!mongoose.isValidObjectId(id)) throw notFound("Person not found.");
  const p = await Person.findById(id).lean();
  if (!p) throw notFound("Person not found.");
  const links = await casesOfPerson(p._id);
  if (!(await mayOpen(actor, links))) throw notFound("Person not found.");
  await recordAudit({
    actor: auditActor(actor),
    action: "persons.viewed",
    summary: "Opened a person's record",
    target: { type: "person", id: String(p._id), label: p.name },
    source: ctx,
    places: [actor],
  });
  const vehicles = await Vehicle.find(
    { "ownership.personId": p._id },
    { plate: 1, ownership: 1 },
  ).lean();
  return {
    ...personFullView(p),
    cases: links,
    vehicles: vehicles.map((v) => {
      const own = v.ownership.filter((o) => String(o.personId) === String(p._id)).at(-1);
      return {
        id: String(v._id),
        plate: v.plate,
        from: own?.from.toISOString() ?? null,
        to: own?.to ? own.to.toISOString() : null,
      };
    }),
    can: { edit: isInvestigator(actor) || scopeOf(actor.role, "persons.view") === "N" },
  };
}

/**
 * Corrects a person's details, with a reason (V5). Allowed to the
 * investigators who may open the record, and HQ supervisors.
 * @param {Actor} actor @param {string} id @param {any} input @param {RequestContext} ctx
 */
export async function updatePerson(actor, id, input, ctx) {
  if (!mongoose.isValidObjectId(id)) throw notFound("Person not found.");
  const p = await Person.findById(id);
  if (!p) throw notFound("Person not found.");
  const links = await casesOfPerson(p._id);
  if (!(await mayOpen(actor, links))) throw notFound("Person not found.");
  if (!(isInvestigator(actor) || scopeOf(actor.role, "persons.view") === "N")) throw forbidden();
  const data = cleanPerson({ type: p.type, name: input.name ?? p.name, ...input });
  await refuseDuplicate(data, p._id);
  const fields = Object.keys(data).filter(
    (k) => k !== "type" && String(/** @type {any} */ (p)[k] ?? "") !== String(data[k] ?? ""),
  );
  if (!fields.length) throw validationError({ reason: "Nothing changed." });
  await inTransaction(async (session) => {
    p.set(data);
    p.changes.push({ at: new Date(), by: actor.name, fields, reason: input.reason });
    await p.save({ session });
    await recordAudit(
      {
        actor: auditActor(actor),
        action: "persons.updated",
        summary: `Changed ${fields.join(", ")}: ${input.reason}`,
        target: { type: "person", id: String(p._id), label: p.name },
        source: ctx,
        places: [actor],
      },
      session,
    );
  });
  return getPerson(actor, id, ctx);
}

// ── Vehicles ────────────────────────────────────────────────────────────

/**
 * A vehicle's record: the registry details, its cases and flags; owners'
 * names only for roles that may see people.
 * @param {Actor} actor @param {string} id
 */
export async function getVehicle(actor, id) {
  if (!mongoose.isValidObjectId(id)) throw notFound("Vehicle not found.");
  const v = await Vehicle.findById(id).lean();
  if (!v) throw notFound("Vehicle not found.");
  const links = await casesOfVehicle(v._id);
  const scope = scopeOf(actor.role, "cases.view");
  if (!(scope === "N" || scope === "R" || (await mayOpenVehicle(actor, links)))) {
    throw notFound("Vehicle not found.");
  }
  const showPeople = Boolean(scopeOf(actor.role, "persons.view"));
  const owners = showPeople
    ? await Person.find({ _id: { $in: v.ownership.map((o) => o.personId) } }, { name: 1 }).lean()
    : [];
  const names = new Map(owners.map((o) => [String(o._id), o.name]));
  return {
    ...vehicleView(v),
    ownership: v.ownership.map((o) => ({
      personId: showPeople ? String(o.personId) : null,
      name: showPeople ? (names.get(String(o.personId)) ?? null) : null,
      from: o.from.toISOString(),
      to: o.to ? o.to.toISOString() : null,
      dmtReference: o.dmtReference ?? null,
      recordedBy: o.recordedBy,
    })),
    checks: v.checks.map((c) => ({
      at: c.at?.toISOString() ?? null,
      by: c.by,
      dmtReference: c.dmtReference,
      caseNumber: c.caseNumber ?? null,
    })),
    cases: links,
  };
}

/** Station staff see vehicles of their own cases. @param {Actor} actor @param {CaseLink[]} links */
async function mayOpenVehicle(actor, links) {
  const scope = scopeOf(actor.role, "cases.view");
  if (scope === "S") return links.some((l) => l.stationId === String(actor.stationId));
  if (scope === "D") {
    const stations = (await Station.find({ divisionId: actor.divisionId }).distinct("_id")).map(
      String,
    );
    return links.some((l) => l.stationId && stations.includes(l.stationId));
  }
  return false;
}

/** @param {any} v */
export const vehicleView = (v) => ({
  id: String(v._id),
  plate: v.plate,
  type: v.type ?? null,
  make: v.make ?? null,
  model: v.model ?? null,
  colour: v.colour ?? null,
  lastCheckedAt: v.lastCheckedAt ? v.lastCheckedAt.toISOString() : null,
  flags: (v.flags ?? [])
    .filter((/** @type {any} */ f) => !f.clearedAt)
    .map((/** @type {any} */ f) => ({
      type: f.type,
      note: f.note,
      reference: f.reference ?? null,
      since: f.since ? f.since.toISOString() : null,
      at: f.at.toISOString(),
      by: f.by,
    })),
});

/**
 * Flags a vehicle (docs/04 §8): a suspected false or cloned plate, or a
 * vehicle reported stolen (offences after `since` aren't the owner's).
 * @param {Actor} actor @param {string} id
 * @param {{ type: "suspected_false_plate" | "reported_stolen", note: string, reference?: string, since?: Date }} input
 * @param {RequestContext} ctx
 */
export async function flagVehicle(actor, id, input, ctx) {
  if (!mongoose.isValidObjectId(id)) throw notFound("Vehicle not found.");
  const v = await Vehicle.findById(id);
  if (!v) throw notFound("Vehicle not found.");
  if (!(await mayOpenVehicle(actor, await casesOfVehicle(v._id))))
    throw notFound("Vehicle not found.");
  if (v.flags.some((f) => f.type === input.type && !f.clearedAt)) {
    throw validationError({ type: "The vehicle already has this flag." });
  }
  if (input.type === "reported_stolen" && !input.since) {
    throw validationError({ since: "When was it stolen?" });
  }
  await inTransaction(async (session) => {
    v.flags.push({
      type: input.type,
      note: input.note,
      reference: input.reference ?? null,
      since: input.since ?? null,
      at: new Date(),
      by: actor.name,
    });
    await v.save({ session });
    await recordAudit(
      {
        actor: auditActor(actor),
        action: "vehicles.flagged",
        summary: `Flagged ${v.plate}: ${input.type.replaceAll("_", " ")} — ${input.note}`,
        target: { type: "vehicle", id: String(v._id), label: v.plate },
        source: ctx,
        places: [actor],
      },
      session,
    );
  });
  return getVehicle(actor, id);
}

/**
 * Whether the user may open a person's record — the same rule as the person
 * page (through the cases they appear on). For other modules: demerit points.
 * @param {Actor} actor @param {any} personId
 */
export async function mayOpenPerson(actor, personId) {
  if (!mongoose.isValidObjectId(personId)) return false;
  return mayOpen(actor, await casesOfPerson(new mongoose.Types.ObjectId(String(personId))));
}

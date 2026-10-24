// Investigation work on a case — docs/04 §6: vehicle trace, driver,
// evidence review, statements, more evidence. Only the investigating
// officer and the OIC at the case's station record work (D03-8); the first
// work moves the case to "investigating" (C2).

import { conflict, forbidden, validationError } from "#src/core/errors.js";
import { normalizePlate } from "#src/core/srilanka.js";
import { recordEvidence, storeFile } from "../evidence/index.js";
import {
  ownerOn,
  personById,
  recordTrace,
  vehicleById,
  vehicleByPlate,
} from "../registers/index.js";
import { limitValue } from "../settings/settings.service.js";
import { change, getCase, loadVisible } from "./cases.service.js";
import { addEvent, workRecorded } from "./lifecycle.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */
/** @typedef {{ ip: string | null, userAgent: string | null }} RequestContext */
/** @typedef {import("./case.model.js").CaseDocument} CaseDocument */

/** Whether the user records work on this case. @param {Actor} actor @param {any} c */
export function worksOn(actor, c) {
  const own = Boolean(c.stationId) && String(c.stationId) === String(actor.stationId);
  const isOfficer = String(c.investigatingOfficer?.id ?? "") === String(actor.userId);
  return own && (isOfficer || actor.role === "station_oic");
}

/** Loads a case the user may work on now. @param {Actor} actor @param {string} id */
async function forWork(actor, id) {
  const c = await loadVisible(actor, id);
  if (!worksOn(actor, c)) {
    throw forbidden("Only the investigating officer and the station's OIC record work on a case.");
  }
  if (!["accepted", "investigating"].includes(c.status)) {
    throw conflict("wrong_state", "Work is recorded while the case is being investigated.");
  }
  return c;
}

/** @param {any} personId */
async function personOrRefuse(personId) {
  const p = await personById(personId);
  if (!p) throw validationError({ personId: "Choose a person from the register." });
  return p;
}

/**
 * Records the registry trace (docs/04 §3): the vehicle's details and its
 * owner, with the DMT reference. The case's owner is the owner on the
 * offence date (V4) — after a sale, possibly the previous one.
 * @param {Actor} actor @param {string} id @param {any} input @param {RequestContext} ctx
 */
export async function traceVehicle(actor, id, input, ctx) {
  const c = await forWork(actor, id);
  const plate = normalizePlate(input.plate ?? c.facts.vehicleNumber);
  if (!plate)
    throw validationError({ plate: "Enter the plate as a Sri Lankan plate, e.g. WP CAB-1234." });
  const owner = await personOrRefuse(input.ownerId);
  if (input.ownerFrom > input.checkedOn) {
    throw validationError({
      ownerFrom: "The owner can't be registered after the date you checked.",
    });
  }
  await change(actor, c, ctx, "cases.vehicle_traced", async (session) => {
    const { vehicle, ownerAtOffence } = await recordTrace(session, {
      plate,
      type: input.vehicleType ?? null,
      make: input.make ?? null,
      model: input.model ?? null,
      colour: input.colour ?? null,
      ownerId: owner._id,
      ownerFrom: input.ownerFrom,
      dmtReference: input.dmtReference,
      checkedOn: input.checkedOn,
      occurredAt: c.facts.occurredAt,
      by: actor.name,
      caseNumber: c.caseNumber,
    });
    const atOffence = ownerAtOffence ? await personById(ownerAtOffence, session) : null;
    return link(c, actor, vehicle, atOffence, `Traced ${plate} (DMT ${input.dmtReference})`);
  });
  return getCase(actor, id);
}

/**
 * Uses the vehicle's last trace without a new registry check — only while
 * it is recent (V2, default 6 months).
 * @param {Actor} actor @param {string} id @param {RequestContext} ctx
 */
export async function reuseTrace(actor, id, ctx) {
  const c = await forWork(actor, id);
  const plate = c.facts.vehicleNumber;
  const found = plate ? await vehicleByPlate(plate) : null;
  if (!found)
    throw conflict("not_traced", "This vehicle hasn't been traced before. Check the registry.");
  if (!(await recentlyChecked(found.lastCheckedAt))) {
    throw conflict(
      "recheck",
      "The owner was last checked too long ago. Check the registry again and record what you find.",
    );
  }
  await change(actor, c, ctx, "cases.vehicle_traced", async (session) => {
    const vehicle = await vehicleById(found._id, session);
    const ownerId = vehicle ? ownerOn(vehicle, c.facts.occurredAt) : null;
    const atOffence = ownerId ? await personById(ownerId, session) : null;
    return link(c, actor, vehicle, atOffence, `Used the recorded trace of ${plate}`);
  });
  return getCase(actor, id);
}

/** @param {Date | null | undefined} at */
async function recentlyChecked(at) {
  if (!at) return false;
  const months = await limitValue("vehicles.owner_recheck");
  const limit = new Date();
  limit.setMonth(limit.getMonth() - months);
  return at >= limit;
}

/**
 * @param {CaseDocument} c @param {Actor} actor @param {any} vehicle @param {any} atOffence @param {string} what
 */
function link(c, actor, vehicle, atOffence, what) {
  if (c.facts.vehicleNumber !== vehicle.plate) {
    addEvent(
      c,
      "plate_corrected",
      actor.name,
      `${c.facts.vehicleNumber ?? "unknown"} → ${vehicle.plate}`,
    );
    c.facts.vehicleNumber = vehicle.plate;
    c.facts.plateUnknown = false;
  }
  c.vehicle = { id: vehicle._id, plate: vehicle.plate };
  c.owner = atOffence ? { id: atOffence._id, name: atOffence.name } : null;
  const summary = `${what}; owner on the offence date: ${atOffence ? atOffence.name : "not known"}`;
  addEvent(c, "vehicle_traced", actor.name, summary);
  workRecorded(c, actor.name);
  return summary;
}

/**
 * What the register already knows about the case's plate, for the trace
 * form: whether the last check can be reused (V2).
 * @param {Actor} actor @param {string} id
 */
export async function vehicleCheck(actor, id) {
  const c = await loadVisible(actor, id);
  const plate = c.facts.vehicleNumber;
  const found = plate ? await vehicleByPlate(plate) : null;
  if (!found) return { vehicle: null, reusable: false };
  const ownerId = ownerOn(found, c.facts.occurredAt);
  const owner = ownerId ? await personById(ownerId) : null;
  return {
    vehicle: {
      id: String(found._id),
      plate: found.plate,
      type: found.type ?? null,
      make: found.make ?? null,
      model: found.model ?? null,
      colour: found.colour ?? null,
      lastCheckedAt: found.lastCheckedAt ? found.lastCheckedAt.toISOString() : null,
      ownerOnOffenceDate: owner ? { id: String(owner._id), name: owner.name } : null,
      flags: found.flags.filter((f) => !f.clearedAt).map((f) => f.type),
    },
    reusable: await recentlyChecked(found.lastCheckedAt),
  };
}

/**
 * The driver, and how they were identified (docs/04 §5).
 * @param {Actor} actor @param {string} id
 * @param {{ personId: string, basis: string, note?: string }} input @param {RequestContext} ctx
 */
export async function setDriver(actor, id, input, ctx) {
  const c = await forWork(actor, id);
  const p = await personOrRefuse(input.personId);
  await change(actor, c, ctx, "cases.driver_set", async () => {
    c.driver = { id: p._id, name: p.name, basis: input.basis, note: input.note ?? null };
    const summary = `Driver: ${p.name} (${input.basis.replaceAll("_", " ")})`;
    addEvent(c, "driver_set", actor.name, summary);
    workRecorded(c, actor.name);
    return summary;
  });
  return getCase(actor, id);
}

export const REVIEW_ITEMS = /** @type {const} */ ([
  "plateReadable",
  "vehicleMatches",
  "timePlaceConsistent",
  "noEditing",
  "offenceVisible",
]);

/**
 * The evidence review checklist (docs/04 §6). Each item answered yes or no;
 * a "no" needs a note.
 * @param {Actor} actor @param {string} id @param {any} input @param {RequestContext} ctx
 */
export async function saveReview(actor, id, input, ctx) {
  const c = await forWork(actor, id);
  if (REVIEW_ITEMS.some((k) => input[k] === false) && !input.note) {
    throw validationError({ note: "Explain what didn't check out." });
  }
  await change(actor, c, ctx, "cases.evidence_reviewed", async () => {
    c.review = {
      ...Object.fromEntries(REVIEW_ITEMS.map((k) => [k, input[k]])),
      note: input.note ?? null,
      by: actor.name,
      at: new Date(),
    };
    const failed = REVIEW_ITEMS.filter((k) => input[k] === false).length;
    const summary = failed
      ? `Evidence reviewed: ${failed} point${failed === 1 ? "" : "s"} didn't check out`
      : "Evidence reviewed: all points check out";
    addEvent(c, "evidence_reviewed", actor.name, summary);
    workRecorded(c, actor.name);
    return summary;
  });
  return getCase(actor, id);
}

/**
 * A statement from the owner, driver or a witness: who, when, a written
 * summary, optionally a scan or recording already added as case evidence.
 * @param {Actor} actor @param {string} id @param {any} input @param {RequestContext} ctx
 */
export async function addStatement(actor, id, input, ctx) {
  const c = await forWork(actor, id);
  const p = input.personId ? await personOrRefuse(input.personId) : null;
  if (!p && !input.name) throw validationError({ name: "Who gave the statement?" });
  if (input.evidenceId && !c.evidenceIds.some((e) => String(e) === input.evidenceId)) {
    throw validationError({ evidenceId: "Attach a file added to this case." });
  }
  await change(actor, c, ctx, "cases.statement_added", async () => {
    c.statements.push({
      role: input.role,
      personId: p?._id ?? null,
      name: p?.name ?? input.name,
      takenAt: input.takenAt,
      summary: input.summary,
      evidenceId: input.evidenceId ?? null,
      by: actor.name,
      at: new Date(),
    });
    const summary = `Statement from the ${input.role}: ${p?.name ?? input.name}`;
    addEvent(c, "statement_added", actor.name, summary);
    workRecorded(c, actor.name);
    return summary;
  });
  return getCase(actor, id);
}

/**
 * Evidence added during investigation — same rules as reports' (docs/10):
 * stored as received, with its fingerprint and custody log.
 * @param {Actor} actor @param {string} id
 * @param {import("../evidence/receive-upload.js").ReceivedFile} file
 * @param {import("#src/core/storage.js").Storage} storage @param {RequestContext} ctx
 */
export async function addCaseEvidence(actor, id, file, storage, ctx) {
  try {
    const c = await forWork(actor, id);
    if (c.evidenceIds.length >= 30) throw conflict("too_many", "A case can hold up to 30 files.");
    const key = await storeFile(storage, file);
    try {
      await change(actor, c, ctx, "cases.evidence_added", async (session) => {
        const item = await recordEvidence(session, {
          key,
          file,
          reportId: null,
          caseId: c._id,
          receivedVia: "investigation",
          by: { id: actor.userId, name: actor.name },
        });
        c.evidenceIds.push(item._id);
        const summary = `Added a ${file.type.kind} (fingerprint ${file.sha256.slice(0, 12)}…)`;
        addEvent(c, "evidence_added", actor.name, summary);
        workRecorded(c, actor.name);
        return summary;
      });
    } catch (err) {
      await storage.remove(key).catch(() => {});
      throw err;
    }
    return getCase(actor, id);
  } finally {
    await file.cleanUp();
  }
}

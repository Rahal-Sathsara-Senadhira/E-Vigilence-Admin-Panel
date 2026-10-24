// What other modules may use from the registers (docs/04).

import { Person, Vehicle } from "./registers.model.js";

export { provideCaseLinks } from "./registers.service.js";

/**
 * The owner on a date (V4): the ownership that covers it, or null.
 * @param {{ ownership: { personId: any, from: Date, to?: Date | null }[] }} v @param {Date} at
 */
export function ownerOn(v, at) {
  const o = v.ownership.find((x) => x.from <= at && (!x.to || x.to > at));
  return o ? o.personId : null;
}

/**
 * Records what an officer found in the registry (docs/04 §3): creates the
 * vehicle on its first trace (V1), updates its description to the latest
 * check, and adds a new ownership when the owner changed — the old one is
 * closed, never overwritten (V3). Returns the vehicle and its owner on the
 * offence date (V4).
 * @param {import("mongoose").ClientSession} session
 * @param {{ plate: string, type: string | null, make: string | null, model: string | null, colour: string | null,
 *   ownerId: any, ownerFrom: Date, dmtReference: string, checkedOn: Date, occurredAt: Date,
 *   by: string, caseNumber: string }} t
 */
export async function recordTrace(session, t) {
  const v =
    (await Vehicle.findOne({ plate: t.plate }, null, { session })) ??
    new Vehicle({ plate: t.plate });
  v.set({ type: t.type, make: t.make, model: t.model, colour: t.colour });
  const now = new Date();
  const current = v.ownership.find((o) => !o.to);
  if (!current || String(current.personId) !== String(t.ownerId)) {
    if (current) current.to = t.ownerFrom > current.from ? t.ownerFrom : now;
    v.ownership.push({
      personId: t.ownerId,
      from: t.ownerFrom,
      to: null,
      dmtReference: t.dmtReference,
      recordedBy: t.by,
      recordedAt: now,
    });
  }
  v.lastCheckedAt = now;
  v.checks.push({
    at: now,
    by: t.by,
    dmtReference: t.dmtReference,
    checkedOn: t.checkedOn,
    caseNumber: t.caseNumber,
  });
  await v.save({ session });
  return { vehicle: v, ownerAtOffence: ownerOn(v, t.occurredAt) };
}

/** A vehicle by its canonical plate, or null. @param {string} plate */
export const vehicleByPlate = (plate) => Vehicle.findOne({ plate }).lean();

/** @param {any} id @param {import("mongoose").ClientSession} [session] */
export const vehicleById = (id, session) => Vehicle.findById(id, null, { session });

/** People by id, for names on cases. @param {any[]} ids */
export const peopleByIds = (ids) =>
  Person.find({ _id: { $in: ids.filter(Boolean) } }, { name: 1, address: 1, type: 1 }).lean();

/** @param {any} id @param {import("mongoose").ClientSession} [session] */
export const personById = (id, session) => Person.findById(id, null, { session }).lean();

/**
 * Records a new address found while serving a notice (V5: with the reason,
 * kept in the person's changes), in the caller's transaction.
 * @param {import("mongoose").ClientSession} session @param {any} personId
 * @param {string} address @param {string} by @param {string} reason
 */
export async function correctAddress(session, personId, address, by, reason) {
  await Person.updateOne(
    { _id: personId },
    {
      $set: { address },
      $push: { changes: { at: new Date(), by, fields: ["address"], reason } },
    },
    { session },
  );
}

/**
 * The person named as the driver (docs/05 §6.2): the recorded person with
 * that NIC or licence number, or a new record (P1: never a second one).
 * @param {import("mongoose").ClientSession} session
 * @param {{ name: string, nic?: string | null, licenceNumber?: string | null, address: string, phone?: string | null }} d
 * @param {string} by
 */
export async function findOrAddPerson(session, d, by) {
  /** @type {any[]} */
  const or = [];
  if (d.nic) or.push({ nic: d.nic });
  if (d.licenceNumber) or.push({ licenceNumber: d.licenceNumber });
  const found = or.length ? await Person.findOne({ $or: or }, null, { session }) : null;
  if (found) {
    if (!found.address) {
      found.address = d.address;
      found.changes.push({
        at: new Date(),
        by,
        fields: ["address"],
        reason: "Given when named as the driver",
      });
      await found.save({ session });
    }
    return found;
  }
  const [created] = await Person.create(
    [
      {
        type: "individual",
        name: d.name,
        nic: d.nic,
        licenceNumber: d.licenceNumber,
        address: d.address,
        phone: d.phone,
        createdBy: by,
      },
    ],
    { session },
  );
  return /** @type {NonNullable<typeof created>} */ (created);
}

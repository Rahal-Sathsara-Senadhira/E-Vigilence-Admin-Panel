// What other modules may use from the offence schedule.

import { validationError } from "#src/core/errors.js";
import { OffenceVersion } from "./offences.model.js";

export { VEHICLE_TYPES } from "./offences.model.js";

/** Vehicle types as a sentence names them. */
const VEHICLE_NOUNS = {
  motorcycle: "motorcycles",
  three_wheeler: "three-wheelers",
  car: "cars",
  van: "vans",
  bus: "buses",
  lorry: "lorries",
  tractor: "tractors",
  other: "other vehicles",
};

/**
 * Whether an offence can be committed with this type of vehicle. An offence
 * with no vehicle types applies to every vehicle; when the vehicle type is
 * unknown or "other", any offence may apply.
 * @param {{ vehicleTypes?: string[] | null }} offence @param {string | null | undefined} vehicleType
 */
export const appliesToVehicle = (offence, vehicleType) =>
  !vehicleType ||
  vehicleType === "other" ||
  !offence.vehicleTypes?.length ||
  offence.vehicleTypes.includes(vehicleType);

/**
 * The offences that can't apply to this vehicle type.
 * @template {{ vehicleTypes?: string[] | null }} O
 * @param {O[]} offences @param {string | null | undefined} vehicleType
 */
export const offencesNotFitting = (offences, vehicleType) =>
  offences.filter((o) => !appliesToVehicle(o, vehicleType));

/**
 * Checks that every code is an offence in force now, and returns them. With
 * a vehicle type, each offence must also apply to it ("No helmet" isn't an
 * offence in a car).
 * @param {string[]} codes
 * @param {{ field?: string, vehicleType?: string | null }} [o] the form field to report problems on
 */
export async function activeOffences(codes, { field = "offenceCodes", vehicleType = null } = {}) {
  const unique = [...new Set(codes.map((c) => c.toUpperCase()))];
  const found = await OffenceVersion.find({
    code: { $in: unique },
    current: true,
    active: true,
  }).lean();
  const missing = unique.filter((c) => !found.some((o) => o.code === c));
  if (missing.length) {
    throw validationError({ [field]: `Not offences in force: ${missing.join(", ")}.` });
  }
  const misfit = offencesNotFitting(found, vehicleType);
  if (misfit.length) {
    const noun =
      VEHICLE_NOUNS[/** @type {keyof typeof VEHICLE_NOUNS} */ (vehicleType)] ?? vehicleType;
    throw validationError({
      [field]: misfit
        .map(
          (o) =>
            `"${o.name}" applies only to ${o.vehicleTypes
              .map((t) => VEHICLE_NOUNS[/** @type {keyof typeof VEHICLE_NOUNS} */ (t)] ?? t)
              .join(", ")}, not ${noun}.`,
        )
        .join(" "),
    });
  }
  return found;
}

/**
 * The offences a citizen may report, among these codes — those not in force
 * or not reportable are left out, not refused (mobile-app import, docs/11 §8).
 * @param {string[]} codes
 */
export async function reportableOffences(codes) {
  const unique = [...new Set(codes.map((c) => String(c).trim().toUpperCase()))].slice(0, 5);
  if (!unique.length) return [];
  return OffenceVersion.find({
    code: { $in: unique },
    current: true,
    active: true,
    citizenReportable: true,
  }).lean();
}

/**
 * The old app's free-text offence matched to the schedule by code or name
 * (docs/11 §9), or null.
 * @param {string} text
 */
export async function offenceNamed(text) {
  const wanted = text.trim().toLowerCase();
  if (!wanted) return null;
  const current = await OffenceVersion.find({ current: true, active: true }).lean();
  return (
    current.find((o) =>
      [o.code, o.name, o.publicName].some((n) => n.trim().toLowerCase() === wanted),
    ) ?? null
  );
}

/**
 * The suggested priority — docs/02 §8: a severe offence, or someone hurt,
 * is P1; anything else P2. HQ can change it with a reason (P3 for weak
 * reports of minor offences).
 * @param {{ severity: string }[]} offences @param {boolean} injuries
 * @returns {"P1" | "P2"}
 */
export const suggestPriority = (offences, injuries) =>
  injuries || offences.some((o) => o.severity === "severe") ? "P1" : "P2";

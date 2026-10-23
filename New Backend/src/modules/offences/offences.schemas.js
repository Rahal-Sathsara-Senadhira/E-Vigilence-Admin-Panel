// Request bodies for the offence schedule.

import { z } from "zod";
import { OUTCOMES, SEVERITIES, VEHICLE_TYPES } from "./offences.model.js";

export const listSchema = z.object({
  q: z.string().trim().max(80).optional(),
  outcome: z.enum(OUTCOMES).optional(),
  severity: z.enum(SEVERITIES).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

const fields = {
  name: z.string().trim().min(3, "Enter the offence name.").max(160),
  legalReference: z.string().trim().min(2, "Enter the section of the law.").max(120),
  outcome: z.enum(OUTCOMES, { error: "Choose how it is dealt with." }),
  spotFine: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce.number().int("Whole rupees only.").positive().max(1_000_000).nullable(),
  ),
  severity: z.enum(SEVERITIES, { error: "Choose the severity." }),
  demeritPoints: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce.number().int().min(0).max(24).nullable(),
  ),
  vehicleTypes: z.array(z.enum(VEHICLE_TYPES)).default([]),
  citizenReportable: z.boolean(),
  publicName: z.string().trim().min(3, "Enter the name citizens see.").max(80),
  publicDescription: z
    .string()
    .trim()
    .min(10, "Describe it for citizens (10+ characters).")
    .max(300),
};

/** A spot fine needs an amount; a court-only offence has none. */
const fineMatchesOutcome = (/** @type {{ outcome: string, spotFine: number | null }} */ v) =>
  v.outcome === "spot_fine" ? v.spotFine !== null : v.spotFine === null;
const fineIssue = {
  message: "Enter the spot fine, or choose court-only (no fine).",
  path: ["spotFine"],
};

export const createSchema = z
  .object({
    ...fields,
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,20}$/, "Use 3–20 letters, digits or dashes, e.g. MTA-157A."),
  })
  .refine(fineMatchesOutcome, fineIssue);

export const changeSchema = z
  .object({
    ...fields,
    active: z.boolean(),
    reason: z
      .string()
      .trim()
      .min(5, "Say why it changed (e.g. the gazette that changed it).")
      .max(500),
  })
  .refine(fineMatchesOutcome, fineIssue);

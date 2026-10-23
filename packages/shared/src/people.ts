// The vehicle and person registers — docs/04 §3–4. Built from officer
// look-ups through police channels (we can't query the DMT directly).

import { z } from "zod";
import { VEHICLE_TYPES } from "./offences.js";
import { normalizeNic, normalizePhone, normalizePlate } from "./utils/srilanka.js";

/** A traced owner can be reused for a new case for this long; then it must be re-checked (V2, D04-2). */
export const OWNER_RECHECK_MONTHS = 6;
/** Repeat-offender banner: this many enforcement outcomes in 12 months (D04-4). */
export const REPEAT_OFFENDER_THRESHOLD = 3;

export const PERSON_TYPES = ["individual", "organisation"] as const;
export type PersonType = (typeof PERSON_TYPES)[number];

export const VEHICLE_FLAGS = ["suspected_false_plate", "reported_stolen"] as const;
export type VehicleFlag = (typeof VEHICLE_FLAGS)[number];

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const personSchema = z
  .object({
    type: z.enum(PERSON_TYPES),
    name: z.string().trim().min(2, "Enter the name.").max(160),
    nic: optionalTrimmed(20).transform((v, ctx) => {
      if (!v) return undefined;
      const nic = normalizeNic(v);
      if (!nic) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a valid NIC (e.g. 852345678V or 198523405678).",
        });
        return z.NEVER;
      }
      return nic;
    }),
    businessRegNo: optionalTrimmed(30),
    licenceNumber: optionalTrimmed(20).transform((v) => v?.toUpperCase()),
    address: optionalTrimmed(300),
    phone: optionalTrimmed(20).transform((v, ctx) => {
      if (!v) return undefined;
      const p = normalizePhone(v);
      if (!p) {
        ctx.addIssue({ code: "custom", message: "Enter a valid Sri Lankan phone number." });
        return z.NEVER;
      }
      return p;
    }),
  })
  .refine((v) => v.type !== "organisation" || !!v.businessRegNo, {
    message: "Enter the business registration number.",
    path: ["businessRegNo"],
  });
export type PersonInput = z.input<typeof personSchema>;

export const personSearchSchema = z.object({
  nic: z.string().trim().optional(),
  licenceNumber: z.string().trim().optional(),
  businessRegNo: z.string().trim().optional(),
  q: z.string().trim().max(80).optional(),
});

/** Recording what an officer found through police channels (docs/04 §3). */
export const vehicleTraceSchema = z.object({
  plate: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const p = normalizePlate(v);
      if (!p) {
        ctx.addIssue({ code: "custom", message: "Enter a Sri Lankan plate, e.g. WP CAB-1234." });
        return z.NEVER;
      }
      return p;
    }),
  type: z.enum(VEHICLE_TYPES),
  make: optionalTrimmed(60),
  model: optionalTrimmed(60),
  colour: optionalTrimmed(40),
  ownerId: z.string().regex(/^[a-f\d]{24}$/i, "Choose or add the owner."),
  /** Owner on the offence date (V4) — when the vehicle changed hands. */
  ownedFrom: z.coerce.date().optional(),
  dmtReference: z.string().trim().min(3, "Enter the DMT reference or look-up number.").max(60),
});

export const setDriverSchema = z.object({
  driverId: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .nullable(),
  basis: z
    .string()
    .trim()
    .min(10, "Say how the driver was identified (statement, evidence…).")
    .max(500),
});

export const vehicleFlagSchema = z.object({
  flag: z.enum(VEHICLE_FLAGS),
  on: z.boolean(),
  reference: z.string().trim().max(100).optional(),
  reason: z.string().trim().min(5).max(500),
});

export interface PersonView {
  id: string;
  type: PersonType;
  name: string;
  nic: string | null;
  businessRegNo: string | null;
  licenceNumber: string | null;
  address: string | null;
  phone: string | null;
  createdAt: string;
  cases: {
    id: string;
    caseNumber: string;
    role: "owner" | "driver";
    status: string;
    occurredAt: string;
  }[];
  enforcementLast12Months: number;
}

export interface VehicleView {
  id: string;
  plate: string;
  type: string | null;
  make: string | null;
  model: string | null;
  colour: string | null;
  flags: string[];
  ownership: {
    personId: string;
    personName: string;
    from: string | null;
    to: string | null;
    dmtReference: string;
    recordedBy: string;
    recordedAt: string;
  }[];
  currentOwner: { id: string; name: string; recordedAt: string; needsRecheck: boolean } | null;
  cases: { id: string; caseNumber: string; status: string; occurredAt: string }[];
  enforcementLast12Months: number;
}

// The offence schedule — docs/14 §4.5 (D14-8), docs/02 §8, docs/16 §5.
//
// Offences are identified by a stable `code` ("MTA-158"). A change to a fine
// or a rule is a new *version* with dates, never an edit, so a notice issued
// last year still shows the fine of last year (docs/14 M6).

import { z } from "zod";

export const SEVERITIES = ["minor", "moderate", "severe"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** How a proven offence is dealt with (docs/05, docs/06). */
export const OFFENCE_OUTCOMES = ["spot_fine", "court"] as const;
export type OffenceOutcome = (typeof OFFENCE_OUTCOMES)[number];

export const VEHICLE_TYPES = [
  "motorcycle",
  "three_wheeler",
  "car",
  "van",
  "bus",
  "lorry",
  "tractor",
  "other",
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  motorcycle: "Motorcycle",
  three_wheeler: "Three-wheeler",
  car: "Car",
  van: "Van / jeep",
  bus: "Bus",
  lorry: "Lorry",
  tractor: "Tractor",
  other: "Other",
};

export const offenceCodeSchema = z
  .string()
  .regex(/^[A-Z]{2,5}-[0-9A-Z]{1,6}$/, "Invalid offence code.");

export const offenceVersionSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    legalReference: z.string().trim().min(2).max(120),
    outcome: z.enum(OFFENCE_OUTCOMES),
    /** Whole rupees (docs/14 M4); required for spot fines, null for court-only offences. */
    spotFine: z.number().int().positive().max(1_000_000).nullable(),
    severity: z.enum(SEVERITIES),
    /** Set by HQ when the national scheme applies (docs/08); null until then. */
    demeritPoints: z.number().int().min(0).max(24).nullable(),
    /** Empty = any vehicle. */
    vehicleTypes: z.array(z.enum(VEHICLE_TYPES)).max(VEHICLE_TYPES.length),
    /** Shown in the mobile app so citizens can report it (docs/11 §3). */
    citizenReportable: z.boolean(),
    publicName: z.string().trim().min(3).max(80),
    publicDescription: z.string().trim().min(10).max(300),
    active: z.boolean(),
    reason: z.string().trim().min(5, "Give a reason.").max(500),
  })
  .refine((v) => (v.outcome === "spot_fine" ? v.spotFine !== null : v.spotFine === null), {
    message: "A spot-fine offence needs a fine; a court-only offence has none.",
    path: ["spotFine"],
  });
export type OffenceVersionInput = z.input<typeof offenceVersionSchema>;

export interface OffenceView {
  code: string;
  version: number;
  name: string;
  legalReference: string;
  outcome: OffenceOutcome;
  spotFine: number | null;
  severity: Severity;
  demeritPoints: number | null;
  vehicleTypes: VehicleType[];
  citizenReportable: boolean;
  publicName: string;
  publicDescription: string;
  active: boolean;
  effectiveFrom: string;
  source: string;
}

/** What the mobile app may show — no fines, no legal detail (docs/11 §3). */
export interface PublicOffence {
  code: string;
  name: string;
  description: string;
  vehicleTypes: VehicleType[];
}

export function formatRupees(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return `Rs ${amount.toLocaleString("en-LK")}`;
}

// Reports and triage — docs/02-reports-and-triage.md.

import { z } from "zod";
import { defineMachine } from "./stateMachine.js";
import { offenceCodeSchema, VEHICLE_TYPES, type VehicleType } from "./offences.js";
import { normalizePhone, normalizePlate } from "./utils/srilanka.js";
import type { StatusFamily } from "./machines/case.js";

// ── Channels (§3) ──────────────────────────────────────────────────────

export const CHANNELS = ["citizen_app", "whatsapp", "phone", "walk_in", "officer", "cctv"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  citizen_app: "Mobile app",
  whatsapp: "WhatsApp",
  phone: "Phone call",
  walk_in: "Walk-in",
  officer: "Officer observed",
  cctv: "Camera",
};

/** Channels staff enter by hand. HQ records WhatsApp and phone; stations record walk-in, phone and officer reports. */
export const HQ_ENTRY_CHANNELS = ["whatsapp", "phone"] as const satisfies readonly Channel[];
export const STATION_ENTRY_CHANNELS = [
  "walk_in",
  "phone",
  "officer",
] as const satisfies readonly Channel[];

// ── Triage states (§6, §7) ─────────────────────────────────────────────

export const triageMachine = defineMachine({
  name: "report triage",
  initial: "pending",
  transitions: {
    /** Officer-observed: waits for another officer or the OIC (§7, S1). */
    pending_station: ["accepted", "rejected"],
    pending: ["accepted", "merged", "needs_info", "rejected"],
    needs_info: ["pending", "rejected"],
    /** Station-accepted reports can still be merged or rejected at HQ review (§7). */
    accepted: ["merged", "rejected"],
    /** Undo a merge (§6.2). */
    merged: ["pending"],
    /** Reconsider within 30 days (§6.4). */
    rejected: ["pending"],
  },
});
export type TriageStatus = (typeof triageMachine.states)[number];

export const TRIAGE_LABELS: Record<TriageStatus, string> = {
  pending_station: "Awaiting second officer",
  pending: "Awaiting triage",
  needs_info: "Waiting for reporter",
  accepted: "Accepted",
  merged: "Merged",
  rejected: "Rejected",
};

/** docs/13 §3.4 mapping for reports. */
export const TRIAGE_FAMILY: Record<TriageStatus, StatusFamily> = {
  pending_station: "new",
  pending: "new",
  needs_info: "waiting",
  accepted: "good",
  merged: "closed",
  rejected: "problem",
};

// ── Rejections (§6.4) ──────────────────────────────────────────────────

export const REJECTION_REASONS = {
  not_an_offence: "What you reported isn't a traffic offence we can act on.",
  insufficient_evidence: "We couldn't act on this report because the evidence wasn't enough.",
  vehicle_unidentifiable: "We couldn't identify the vehicle from this report.",
  outside_jurisdiction: "This happened outside Sri Lanka Police's area.",
  too_old: "This happened more than 30 days ago, so we can't act on it.",
  fabricated: "We couldn't accept this report.",
  abusive: "We couldn't accept this report.",
  not_traffic: "This isn't a traffic matter. For other matters call 119.",
  no_response: "We closed this report because we didn't receive the information we asked for.",
} as const;
export type RejectionReason = keyof typeof REJECTION_REASONS;
export const REJECTION_CODES = Object.keys(REJECTION_REASONS) as RejectionReason[];

export const REJECTION_LABELS: Record<RejectionReason, string> = {
  not_an_offence: "Not an offence",
  insufficient_evidence: "Insufficient evidence",
  vehicle_unidentifiable: "Vehicle can't be identified",
  outside_jurisdiction: "Outside Sri Lanka",
  too_old: "More than 30 days old",
  fabricated: "Fabricated or edited evidence",
  abusive: "Abusive",
  not_traffic: "Not a traffic matter",
  no_response: "No response from reporter",
};

/** Count towards reporter abuse (§10). */
export const ABUSE_REASONS: readonly RejectionReason[] = ["fabricated", "abusive"];

/** HQ may reconsider a rejection within this many days (§6.4). */
export const RECONSIDER_DAYS = 30;
/** Reports must be about something that happened within this many days (§4). */
export const MAX_REPORT_AGE_DAYS = 30;
/** Abuse threshold: this many abuse rejections within ABUSE_WINDOW_DAYS flags the reporter (D02-5). */
export const ABUSE_THRESHOLD = 3;
export const ABUSE_WINDOW_DAYS = 90;

// ── Priority (§8) ──────────────────────────────────────────────────────

export const PRIORITIES = ["P1", "P2", "P3"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = {
  P1: "P1 · Urgent",
  P2: "P2 · Normal",
  P3: "P3 · Low",
};

// ── Location ───────────────────────────────────────────────────────────

/** A box around Sri Lanka including its territorial waters. */
export const SRI_LANKA_BOUNDS = { minLat: 5.7, maxLat: 10.1, minLng: 79.4, maxLng: 82.1 } as const;

export function isInSriLanka(lat: number, lng: number): boolean {
  const b = SRI_LANKA_BOUNDS;
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

export const pointSchema = z
  .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
  .refine((p) => isInSriLanka(p.lat, p.lng), "The location must be in Sri Lanka.");

// ── Shared field schemas ───────────────────────────────────────────────

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id.");

const plateSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const plate = normalizePlate(v);
    if (!plate) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a Sri Lankan plate, e.g. WP CAB-1234, or tick “plate unknown”.",
      });
      return z.NEVER;
    }
    return plate;
  });

const occurredAtSchema = z.coerce
  .date()
  .refine((d) => d.getTime() <= Date.now() + 5 * 60_000, "This time is in the future.");

export const reporterSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("anonymous") }),
  z.object({
    kind: z.literal("named"),
    name: z.string().trim().min(2, "Enter the reporter's name.").max(120),
    phone: z
      .string()
      .trim()
      .transform((v, ctx) => {
        const p = normalizePhone(v);
        if (!p) {
          ctx.addIssue({ code: "custom", message: "Enter a valid Sri Lankan phone number." });
          return z.NEVER;
        }
        return p;
      }),
  }),
]);

// ── Recording a report (staff channels) ────────────────────────────────

export const createReportSchema = z
  .object({
    channel: z.enum(["whatsapp", "phone", "walk_in", "officer"]),
    reporter: reporterSchema,
    occurredAt: occurredAtSchema,
    location: pointSchema,
    address: z.string().trim().min(3, "Enter an address or landmark.").max(300),
    plateUnknown: z.boolean().default(false),
    vehicleNumber: plateSchema.optional(),
    vehicleType: z.enum(VEHICLE_TYPES),
    vehicleDescription: z.string().trim().max(200).optional(),
    offenceCodes: z.array(offenceCodeSchema).min(1, "Choose at least one offence.").max(5),
    description: z
      .string()
      .trim()
      .min(10, "Describe what happened (at least 10 characters).")
      .max(2000),
    evidenceIds: z.array(objectId).max(10).default([]),
    /** Staff entering on behalf of HQ choose P1 when someone was hurt (§8). */
    someoneHurt: z.boolean().default(false),
  })
  .refine((v) => v.plateUnknown || !!v.vehicleNumber, {
    message: "Enter the plate, or tick “plate unknown”.",
    path: ["vehicleNumber"],
  })
  .refine((v) => v.channel !== "officer" || v.reporter.kind === "anonymous", {
    // The observing officer is recorded as the receiver; no separate reporter.
    message: "An officer-observed report has no separate reporter.",
    path: ["reporter"],
  });
export type CreateReportInput = z.input<typeof createReportSchema>;

// ── Triage actions ─────────────────────────────────────────────────────

export const acceptReportSchema = z
  .object({
    /** What police conclude — the report keeps what the reporter said (§6.1). */
    offenceCodes: z.array(offenceCodeSchema).min(1).max(5),
    plateUnknown: z.boolean().default(false),
    vehicleNumber: plateSchema.optional(),
    vehicleType: z.enum(VEHICLE_TYPES),
    location: pointSchema,
    address: z.string().trim().min(3).max(300),
    occurredAt: occurredAtSchema,
    priority: z.enum(PRIORITIES),
    /** Required to accept a citizen report without evidence (§6.1, D02-4). */
    noEvidenceReason: z.string().trim().min(5).max(500).optional(),
    note: z.string().trim().max(1000).optional(),
    /** Omit to dispatch automatically (jurisdiction, then nearest — 03 §5.1). */
    stationId: z
      .string()
      .regex(/^[a-f\d]{24}$/i)
      .optional(),
    dispatchReason: z.string().trim().min(5).max(500).optional(),
  })
  .refine((v) => !v.stationId || !!v.dispatchReason, {
    message: "Give a reason for choosing the station yourself.",
    path: ["dispatchReason"],
  })
  .refine((v) => v.plateUnknown || !!v.vehicleNumber, {
    message: "Enter the plate, or tick “plate unknown”.",
    path: ["vehicleNumber"],
  });
export type AcceptReportInput = z.input<typeof acceptReportSchema>;

export const mergeReportSchema = z.object({
  caseId: objectId,
  note: z.string().trim().max(1000).optional(),
});

export const needsInfoSchema = z.object({
  question: z.string().trim().min(10, "Write the question (at least 10 characters).").max(1000),
});

export const rejectReportSchema = z.object({
  reasonCode: z.enum(REJECTION_CODES as [RejectionReason, ...RejectionReason[]]),
  note: z.string().trim().max(1000).optional(),
});

export const reasonOnlySchema = z.object({
  reason: z.string().trim().min(5, "Give a reason.").max(500),
});

export const changePrioritySchema = z.object({
  priority: z.enum(PRIORITIES),
  reason: z.string().trim().min(5, "Give a reason.").max(500),
});

export const replySchema = z.object({
  answer: z.string().trim().min(1).max(1000),
});

export const listReportsQuerySchema = z.object({
  view: z
    .enum(["queue", "needs_info", "station_review", "pending_station", "all"])
    .default("queue"),
  q: z.string().trim().max(50).optional(),
  channel: z.enum(CHANNELS).optional(),
  status: z.enum(triageMachine.states as [TriageStatus, ...TriageStatus[]]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListReportsQuery = z.input<typeof listReportsQuerySchema>;

// ── Views ──────────────────────────────────────────────────────────────

export interface ReporterView {
  kind: "citizen" | "named" | "anonymous";
  /** Masked in lists; full in the detail view for HQ and the handling station (docs/10 §5.3). */
  name: string | null;
  phone: string | null;
  flagged: boolean;
  suspended: boolean;
  abuseCount: number;
}

export interface ReportListItem {
  id: string;
  reportNumber: string;
  channel: Channel;
  receivedAt: string;
  occurredAt: string;
  status: TriageStatus;
  priority: Priority | null;
  suggestedPriority: Priority;
  vehicleNumber: string | null;
  vehicleType: VehicleType;
  offenceCodes: string[];
  address: string;
  evidenceCount: number;
  stationName: string | null;
  lockedBy: string | null;
  overdue: boolean;
  dueAt: string | null;
  flags: string[];
  reporterFlagged: boolean;
}

export interface TriageEvent {
  at: string;
  status: TriageStatus;
  by: string;
  reasonCode: RejectionReason | null;
  note: string | null;
}

export interface ReportDetail extends ReportListItem {
  reporter: ReporterView;
  receivedBy: string;
  vehicleDescription: string | null;
  location: { lat: number; lng: number } | null;
  description: string;
  evidenceIds: string[];
  question: {
    text: string;
    askedAt: string;
    dueAt: string;
    answer: string | null;
    answeredAt: string | null;
  } | null;
  caseId: string | null;
  caseNumber: string | null;
  rejection: { code: RejectionReason; reporterMessage: string; note: string | null } | null;
  reviewedByHq: boolean;
  history: TriageEvent[];
  lock: { by: string; byId: string; until: string } | null;
  canReconsiderUntil: string | null;
}

export interface CaseMatch {
  id: string;
  caseNumber: string;
  status: string;
  priority: Priority;
  vehicleNumber: string | null;
  offenceCodes: string[];
  occurredAt: string;
  address: string;
  distanceMetres: number | null;
  reasons: ("same_plate" | "same_offence_nearby")[];
  reportCount: number;
}

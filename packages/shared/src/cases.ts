// Cases, dispatch, investigation, recommendation and decision —
// docs/03, docs/04 §6, docs/05 §3–4, §8.

import { z } from "zod";
import type { CaseStatus } from "./machines/case.js";
import { offenceCodeSchema, VEHICLE_TYPES, type VehicleType } from "./offences.js";
import { pointSchema, type Priority } from "./reports.js";

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  open: "Not yet dispatched",
  dispatched: "Waiting for station",
  accepted: "Accepted",
  investigating: "Investigating",
  recommended: "Awaiting decision",
  decided: "Decided",
  closed: "Closed",
  returned: "Returned to HQ",
};

// ── Dispatch (docs/03 §5) ──────────────────────────────────────────────

export const DISPATCH_METHODS = ["jurisdiction", "nearest", "manual", "station"] as const;
export type DispatchMethod = (typeof DISPATCH_METHODS)[number];
export const DISPATCH_METHOD_LABELS: Record<DispatchMethod, string> = {
  jurisdiction: "Inside the station's area",
  nearest: "Nearest station",
  manual: "Chosen by HQ",
  station: "Recorded at the station",
};

/** A case returned this many times is "disputed jurisdiction" — HQ must choose the station (D03-3). */
export const RETURNS_BEFORE_DISPUTE = 2;

export const dispatchSchema = z
  .object({
    /** Omit to dispatch automatically (jurisdiction, then nearest). */
    stationId: z
      .string()
      .regex(/^[a-f\d]{24}$/i)
      .optional(),
    reason: z.string().trim().min(5).max(500).optional(),
  })
  .refine((v) => !v.stationId || !!v.reason, {
    message: "Give a reason for choosing the station yourself.",
    path: ["reason"],
  });

export const returnCaseSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Explain why it isn't your station's case (at least 10 characters).")
    .max(500),
});

export const assignOfficerSchema = z.object({
  officerId: z.string().regex(/^[a-f\d]{24}$/i, "Choose an officer."),
  note: z.string().trim().max(500).optional(),
});

// ── Investigation (docs/04 §6) ─────────────────────────────────────────

export const EVIDENCE_REVIEW_ITEMS = {
  plateReadable: "The plate is readable",
  vehicleMatches: "Vehicle type and colour match the registry",
  timePlaceConsistent: "Time and place match the report",
  notEdited: "No sign of editing or AI generation",
  offenceVisible: "The offence can be seen or heard",
} as const;
export type EvidenceReviewItem = keyof typeof EVIDENCE_REVIEW_ITEMS;

export const evidenceReviewSchema = z.object({
  plateReadable: z.boolean(),
  vehicleMatches: z.boolean(),
  timePlaceConsistent: z.boolean(),
  notEdited: z.boolean(),
  offenceVisible: z.boolean(),
  note: z.string().trim().max(1000).optional(),
});

export const noteSchema = z.object({ text: z.string().trim().min(2).max(2000) });

export const STATEMENT_FROM = ["owner", "driver", "witness", "reporter"] as const;
export const statementSchema = z.object({
  from: z.enum(STATEMENT_FROM),
  name: z.string().trim().min(2).max(120),
  takenAt: z.coerce.date(),
  summary: z.string().trim().min(10, "Summarise the statement (at least 10 characters).").max(4000),
  evidenceIds: z
    .array(z.string().regex(/^[a-f\d]{24}$/i))
    .max(5)
    .default([]),
});

export const caseFactsSchema = z.object({
  offenceCodes: z.array(offenceCodeSchema).min(1).max(5).optional(),
  location: pointSchema.optional(),
  address: z.string().trim().min(3).max(300).optional(),
  occurredAt: z.coerce.date().optional(),
  vehicleType: z.enum(VEHICLE_TYPES).optional(),
  note: z.string().trim().min(5, "Say what changed and why.").max(1000),
});

export const caseEvidenceSchema = z.object({
  evidenceIds: z
    .array(z.string().regex(/^[a-f\d]{24}$/i))
    .min(1)
    .max(10),
});

// ── Outcomes (docs/05 §3, §8) ──────────────────────────────────────────

export const OUTCOMES = ["penalty_notice", "court", "warning", "nfa"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const OUTCOME_LABELS: Record<Outcome, string> = {
  penalty_notice: "Penalty notice",
  court: "Court referral",
  warning: "Warning",
  nfa: "No further action",
};

export const NFA_REASONS = {
  owner_not_traced: "The vehicle or owner couldn't be identified",
  insufficient_evidence: "The evidence doesn't prove the offence",
  false_plate: "The plate doesn't belong to the vehicle in the evidence",
  not_an_offence: "On review, no offence was committed",
  offender_unavailable: "Abroad, deceased or otherwise unreachable",
  other: "Other (explain)",
} as const;
export type NfaReason = keyof typeof NFA_REASONS;
const NFA_CODES = Object.keys(NFA_REASONS) as [NfaReason, ...NfaReason[]];

export const ADDRESSEE_ROLES = ["owner", "driver"] as const;
export type AddresseeRole = (typeof ADDRESSEE_ROLES)[number];

export const recommendSchema = z
  .object({
    outcome: z.enum(OUTCOMES),
    /** Who the notice / warning / charge is addressed to (docs/04 §5). */
    addressee: z.enum(ADDRESSEE_ROLES).optional(),
    nfaReason: z.enum(NFA_CODES).optional(),
    justification: z
      .string()
      .trim()
      .min(10, "Justify the recommendation (at least 10 characters).")
      .max(2000),
  })
  .refine((v) => v.outcome !== "nfa" || !!v.nfaReason, {
    message: "Choose the reason for no further action.",
    path: ["nfaReason"],
  })
  .refine((v) => v.outcome === "nfa" || !!v.addressee, {
    message: "Choose who it is addressed to.",
    path: ["addressee"],
  });

export const decideSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), note: z.string().trim().max(1000).optional() }),
  z.object({
    action: z.literal("change"),
    outcome: z.enum(OUTCOMES),
    addressee: z.enum(ADDRESSEE_ROLES).optional(),
    nfaReason: z.enum(NFA_CODES).optional(),
    reason: z.string().trim().min(10, "Explain the change (at least 10 characters).").max(1000),
  }),
  z.object({
    action: z.literal("send_back"),
    reason: z.string().trim().min(10, "Say what more is needed.").max(1000),
  }),
]);

export const overrideSchema = z.object({ reason: z.string().trim().min(10).max(1000) });
export const reopenSchema = z.object({ reason: z.string().trim().min(10).max(1000) });
export const mergeCaseSchema = z.object({
  intoCaseId: z.string().regex(/^[a-f\d]{24}$/i),
  reason: z.string().trim().min(10).max(1000),
});

// ── Listing ────────────────────────────────────────────────────────────

export const CASE_VIEWS = [
  "all",
  "to_accept",
  "mine",
  "no_officer",
  "awaiting_decision",
  "returned",
  "open",
] as const;
export type CaseView = (typeof CASE_VIEWS)[number];

export const listCasesQuerySchema = z.object({
  view: z.enum(CASE_VIEWS).default("all"),
  q: z.string().trim().max(50).optional(),
  status: z.string().optional(),
  stationId: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

// ── Views ──────────────────────────────────────────────────────────────

export interface DispatchView {
  stationId: string;
  stationName: string;
  at: string;
  by: string;
  method: DispatchMethod;
  distanceKm: number | null;
  flags: string[];
  reason: string | null;
  acceptedAt: string | null;
  acceptedBy: string | null;
  returnedAt: string | null;
  returnedBy: string | null;
  returnReason: string | null;
}

export interface CaseListItem {
  id: string;
  caseNumber: string;
  status: CaseStatus;
  priority: Priority;
  vehicleNumber: string | null;
  vehicleType: VehicleType;
  offenceCodes: string[];
  occurredAt: string;
  address: string;
  stationId: string | null;
  stationName: string | null;
  investigatingOfficer: string | null;
  reportCount: number;
  dueAt: string | null;
  overdue: boolean;
  flags: string[];
  updatedAt: string;
}

export interface CaseNoteView {
  at: string;
  by: string;
  text: string;
}

export interface StatementView {
  at: string;
  by: string;
  from: (typeof STATEMENT_FROM)[number];
  name: string;
  takenAt: string;
  summary: string;
  evidenceIds: string[];
}

export interface RecommendationView {
  outcome: Outcome;
  addressee: AddresseeRole | null;
  nfaReason: NfaReason | null;
  justification: string;
  by: string;
  byId: string;
  at: string;
}

export interface DecisionView {
  outcome: Outcome;
  addressee: AddresseeRole | null;
  nfaReason: NfaReason | null;
  changed: boolean;
  note: string | null;
  by: string;
  role: string;
  at: string;
}

export interface CaseDetail extends CaseListItem {
  location: { lat: number; lng: number };
  plateUnknown: boolean;
  reportIds: { id: string; reportNumber: string; channel: string; status: string }[];
  investigatingOfficerId: string | null;
  dispatches: DispatchView[];
  returnCount: number;
  vehicle: {
    id: string;
    plate: string;
    type: string | null;
    make: string | null;
    model: string | null;
    colour: string | null;
    flags: string[];
  } | null;
  owner: PersonSummary | null;
  driver: PersonSummary | null;
  evidenceReview:
    (Record<EvidenceReviewItem, boolean> & { note: string | null; by: string; at: string }) | null;
  notes: CaseNoteView[];
  statements: StatementView[];
  evidenceIds: string[];
  recommendation: RecommendationView | null;
  decision: DecisionView | null;
  closedReason: string | null;
  repeatOffender: { vehicle: number; person: number } | null;
  timeline: { at: string; event: string; by: string; note: string | null }[];
  /** What the signed-in user may do now — the API checks again on every action. */
  can: {
    dispatch: boolean;
    accept: boolean;
    return: boolean;
    assignOfficer: boolean;
    work: boolean;
    recommend: boolean;
    decide: boolean;
    override: boolean;
    reopen: boolean;
    merge: boolean;
  };
  readyToRecommend: { ready: boolean; missing: string[] };
}

export interface PersonSummary {
  id: string;
  type: "individual" | "organisation";
  name: string;
  nicMasked: string | null;
  hasAddress: boolean;
}

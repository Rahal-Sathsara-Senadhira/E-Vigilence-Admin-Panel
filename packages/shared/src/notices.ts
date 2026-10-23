// Penalty notices — docs/05 §5–6, payments — docs/07.

import { z } from "zod";
import { defineMachine } from "./stateMachine.js";
import type { StatusFamily } from "./machines/case.js";
import { normalizeNic } from "./utils/srilanka.js";

export const noticeMachine = defineMachine({
  name: "penalty notice",
  initial: "issued",
  transitions: {
    // Printed, not yet posted.
    issued: ["served", "withdrawn"],
    // Posted (deemed served 3 days later); due date running.
    served: ["paid", "nominated", "disputed", "overdue", "service_failed", "withdrawn"],
    // Returned mail / unknown address: re-serve at a new address, or court (05 §5.1).
    service_failed: ["served", "court_referral", "withdrawn"],
    // Owner named the driver: officer checks, then the driver gets a new notice — or it's rejected.
    nominated: ["transferred", "served", "overdue", "paid", "withdrawn"],
    // OIC reviews: upheld → withdrawn; rejected → served with 7 more days. Paying closes the dispute (07 §12).
    disputed: ["withdrawn", "served", "paid"],
    // Reminder sent; 7 more days, then the OIC confirms a court referral (05 §6.4).
    overdue: ["paid", "court_referral", "nominated", "disputed", "withdrawn"],
    // Late payment is accepted until the court filing (D05-6); phase 4 adds the court case.
    court_referral: ["paid", "withdrawn"],
    // Paid: withdrawn (refunded, 07 §8), or back to served/overdue when HQ reverses a wrongly recorded receipt (07 §6).
    paid: ["withdrawn", "served", "overdue"],
    transferred: [],
    withdrawn: [],
  },
});
export type NoticeStatus = (typeof noticeMachine.states)[number];

export const NOTICE_STATUS_LABELS: Record<NoticeStatus, string> = {
  issued: "Issued — not posted",
  served: "Served",
  service_failed: "Service failed",
  nominated: "Driver named",
  transferred: "Transferred to driver",
  disputed: "Disputed",
  overdue: "Overdue",
  court_referral: "Court referral",
  paid: "Paid",
  withdrawn: "Withdrawn",
};

/** docs/05 §6 table. */
export const NOTICE_STATUS_FAMILY: Record<NoticeStatus, StatusFamily> = {
  issued: "new",
  served: "new",
  service_failed: "problem",
  nominated: "waiting",
  transferred: "closed",
  disputed: "waiting",
  overdue: "problem",
  court_referral: "legal",
  paid: "good",
  withdrawn: "closed",
};

/** Statuses in which the notice can still be paid online (07 §5.1, D05-6). */
export const PAYABLE_STATUSES: readonly NoticeStatus[] = [
  "served",
  "nominated",
  "disputed",
  "overdue",
  "court_referral",
];

// ── Service (05 §5.1) ──────────────────────────────────────────────────

export const recordPostingSchema = z.object({
  postedAt: z.coerce
    .date()
    .refine((d) => d.getTime() <= Date.now() + 60_000, "This is in the future."),
  /** Registered-post or tracking number. */
  postReference: z.string().trim().min(3).max(60),
});

export const serviceFailedSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

export const reserveSchema = z.object({
  address: z.string().trim().min(5, "Enter the new postal address.").max(300),
  postedAt: z.coerce.date(),
  postReference: z.string().trim().min(3).max(60),
});

export const withdrawSchema = z.object({ reason: z.string().trim().min(10).max(1000) });

// ── Nomination and dispute (05 §6.2–6.3) ───────────────────────────────

const idNumber = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const nic = normalizeNic(v);
    if (nic) return nic;
    const licence = v.replace(/\s+/g, "").toUpperCase();
    if (/^[A-Z]?\d{6,10}$/.test(licence)) return licence;
    ctx.addIssue({ code: "custom", message: "Enter the driver's NIC or driving licence number." });
    return z.NEVER;
  });

export const nominationSchema = z.object({
  driverName: z.string().trim().min(2).max(160),
  driverId: idNumber,
  driverAddress: z.string().trim().min(5, "Enter the driver's postal address.").max(300),
  driverPhone: z.string().trim().max(20).optional(),
  declaration: z.literal(true, { error: "Confirm the declaration." }),
});
export type NominationInput = z.input<typeof nominationSchema>;

export const DISPUTE_GROUNDS = {
  not_my_vehicle: "Not my vehicle / the plate is false",
  sold_or_stolen: "The vehicle was sold or stolen at the time",
  evidence_wrong: "The evidence is wrong",
  other: "Other",
} as const;
export type DisputeGround = keyof typeof DISPUTE_GROUNDS;

export const disputeSchema = z.object({
  ground: z.enum(Object.keys(DISPUTE_GROUNDS) as [DisputeGround, ...DisputeGround[]]),
  explanation: z.string().trim().min(20, "Explain the dispute (at least 20 characters).").max(4000),
});
export type DisputeInput = z.input<typeof disputeSchema>;

export const reviewNominationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(10).max(500) }),
]);

export const reviewDisputeSchema = z.object({
  action: z.enum(["uphold", "reject"]),
  reason: z.string().trim().min(10).max(1000),
});

// ── Payments (07) ──────────────────────────────────────────────────────

export const PAYMENT_METHODS = [
  "sim_card",
  "sim_wallet",
  "receipt_cash_agent",
  "receipt_post_office",
  "receipt_bank",
  "legacy",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  sim_card: "Card (test)",
  sim_wallet: "Mobile wallet (test)",
  receipt_cash_agent: "Cash agent receipt",
  receipt_post_office: "Post office receipt",
  receipt_bank: "Bank receipt",
  legacy: "Old system",
};
export const SIMULATOR_OUTCOMES = ["success", "declined", "cancel", "delay"] as const;
export type SimulatorOutcome = (typeof SIMULATOR_OUTCOMES)[number];

export const publicLookupSchema = z.object({
  noticeNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^PN-\d{4}-\d{6}$/, "Enter the notice number, e.g. PN-2026-000318."),
  idNumber: z.string().trim().min(5, "Enter the ID number on the notice.").max(20),
});

export const startPaymentSchema = publicLookupSchema.extend({
  method: z.enum(["sim_card", "sim_wallet"]),
  payerName: z.string().trim().max(120).optional(),
});

export const simulateSchema = z.object({ outcome: z.enum(SIMULATOR_OUTCOMES) });

export const recordReceiptSchema = z.object({
  method: z.enum(["receipt_cash_agent", "receipt_post_office", "receipt_bank"]),
  receiptNumber: z.string().trim().min(3).max(60),
  amount: z.number().int().positive(),
  paidAt: z.coerce.date(),
  scanEvidenceId: z.string().regex(/^[a-f\d]{24}$/i, "Attach a scan or photo of the receipt."),
});

export const refundSchema = z.object({ reason: z.string().trim().min(10).max(1000) });

// ── Views ──────────────────────────────────────────────────────────────

export interface NoticeLine {
  code: string;
  name: string;
  legalReference: string;
  fine: number;
  scheduleVersion: number;
}

export interface NoticeListItem {
  id: string;
  noticeNumber: string;
  caseId: string;
  caseNumber: string;
  status: NoticeStatus;
  addresseeName: string;
  vehicleNumber: string | null;
  amount: number;
  issuedAt: string;
  servedAt: string | null;
  dueDate: string | null;
  overdue: boolean;
  stationName: string | null;
  flags: string[];
}

export interface NoticeDetail extends NoticeListItem {
  addressee: {
    id: string;
    type: string;
    name: string;
    nicMasked: string | null;
    address: string | null;
  };
  addresseeRole: "owner" | "driver";
  lines: NoticeLine[];
  service: {
    address: string;
    attempts: {
      postedAt: string;
      postReference: string;
      address: string;
      result: "served" | "failed" | null;
      note: string | null;
    }[];
  };
  finalDueDate: string | null;
  reminderSentAt: string | null;
  courtProposedAt: string | null;
  responses: {
    at: string;
    kind: "nomination" | "dispute" | "payment" | "review";
    by: string;
    summary: string;
  }[];
  nomination:
    | (Omit<NominationInput, "declaration"> & {
        at: string;
        status: "pending" | "accepted" | "rejected";
      })
    | null;
  dispute:
    | (DisputeInput & {
        at: string;
        status: "pending" | "upheld" | "rejected";
        reviewReason: string | null;
      })
    | null;
  payment: {
    reference: string;
    method: PaymentMethod;
    amount: number;
    receivedAt: string;
    test: boolean;
    refunded: boolean;
  } | null;
  parentNoticeId: string | null;
  childNoticeId: string | null;
  legacy: boolean;
  timeline: { at: string; event: string; by: string; note: string | null }[];
  can: {
    post: boolean;
    serviceFailed: boolean;
    reserve: boolean;
    withdraw: boolean;
    recordNomination: boolean;
    recordDispute: boolean;
    reviewNomination: boolean;
    reviewDispute: boolean;
    confirmCourt: boolean;
    recordReceipt: boolean;
  };
}

/** What the public payment page shows (07 §5.1) — never the reporter, never full personal data. */
export interface PublicNoticeView {
  noticeNumber: string;
  vehicleNumber: string | null;
  offenceDate: string;
  offences: { name: string; fine: number }[];
  amount: number;
  dueDate: string | null;
  status: NoticeStatus;
  addresseeMasked: string;
  payable: boolean;
  canNominate: boolean;
  canDispute: boolean;
  message: string | null;
}

export interface PaymentView {
  id: string;
  reference: string;
  noticeNumber: string;
  noticeId: string;
  amount: number;
  method: PaymentMethod;
  status: "pending" | "succeeded" | "failed" | "refunded";
  payerName: string | null;
  receivedAt: string;
  recordedBy: string;
  test: boolean;
  review: {
    status: "pending" | "accepted" | "reversed";
    by: string | null;
    at: string | null;
  } | null;
  refund: { reference: string; reason: string; approvedBy: string; at: string } | null;
}

export interface OutboxMessageView {
  id: string;
  channel: "post" | "sms";
  to: string;
  template: string;
  subject: string;
  body: string;
  noticeNumber: string | null;
  createdAt: string;
  status: "held";
}

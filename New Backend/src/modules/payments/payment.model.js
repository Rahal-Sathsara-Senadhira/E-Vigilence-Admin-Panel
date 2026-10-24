// Payments — docs/07 §7. Money records only move forward: a payment is
// never edited back or deleted; a wrong receipt is reversed and a paid
// notice that is withdrawn is refunded, each with its reason (P6).

import mongoose from "mongoose";

export const PAYMENT_METHODS = /** @type {const} */ ([
  "sim_card",
  "sim_wallet",
  "receipt_cash_agent",
  "receipt_post_office",
  "receipt_bank",
]);
export const RECEIPT_METHODS = /** @type {const} */ ([
  "receipt_cash_agent",
  "receipt_post_office",
  "receipt_bank",
]);

const byRef = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, default: null },
    name: { type: String, required: true },
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema(
  {
    /** An online payment's session — random, unguessable; the simulator page uses it. */
    sessionId: { type: String, default: null },
    /** Unique; issued on success (SIM-…), or the receipt number (P2). */
    reference: { type: String, default: null },
    /** online · receipt */
    channel: { type: String, enum: ["online", "receipt"], required: true },
    method: { type: String, enum: [...PAYMENT_METHODS, null], default: null },
    /** pending · succeeded · failed · reversed */
    status: { type: String, required: true, index: true },
    failureReason: { type: String, default: null },

    noticeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    noticeNumber: { type: String, required: true },
    caseId: { type: mongoose.Schema.Types.ObjectId, required: true },
    stationId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    /** Whole rupees — always the notice's amount (P1). */
    amount: { type: Number, required: true },
    payerName: { type: String, default: null },
    receivedAt: { type: Date, default: null },
    recordedBy: { type: byRef, required: true },
    /** Bank delay: confirmed after this time. */
    completeAfter: { type: Date, default: null },

    /** The signed confirmation as received (online, P5). */
    confirmation: {
      type: new mongoose.Schema(
        {
          payload: { type: String, required: true },
          signature: { type: String, required: true },
          receivedAt: Date,
        },
        { _id: false },
      ),
      default: null,
    },
    /** A receipt recorded by staff, with its scan (docs/07 §6). */
    receipt: {
      type: new mongoose.Schema(
        {
          number: { type: String, required: true },
          paidOn: { type: Date, required: true },
          scanKey: { type: String, required: true },
          scanMime: { type: String, required: true },
          scanSha256: { type: String, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    /** HQ's review of a recorded receipt — never by the recorder (S3). */
    review: {
      type: new mongoose.Schema(
        { result: String, reason: { type: String, default: null }, by: byRef, at: Date },
        { _id: false },
      ),
      default: null,
    },
    /** Money going back (docs/07 §8). */
    refund: {
      type: new mongoose.Schema(
        {
          /** due · refunded */
          status: { type: String, required: true },
          reason: { type: String, required: true },
          automatic: { type: Boolean, default: false },
          preparedBy: { type: String, default: null },
          dueAt: { type: Date, required: true },
          approvedBy: { type: byRef, default: null },
          refundedAt: { type: Date, default: null },
          reference: { type: String, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    /** double_payment · notice_not_payable · bad_amount */
    flags: { type: [String], default: [] },
    history: {
      type: [
        new mongoose.Schema(
          { at: Date, event: String, by: String, note: { type: String, default: null } },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true, versionKey: false },
);
paymentSchema.index(
  { reference: 1 },
  { unique: true, partialFilterExpression: { reference: { $type: "string" } } },
);
paymentSchema.index(
  { sessionId: 1 },
  { unique: true, partialFilterExpression: { sessionId: { $type: "string" } } },
);
paymentSchema.index({ "refund.status": 1 });
paymentSchema.index({ channel: 1, review: 1 });

export const Payment = mongoose.model("Payment", paymentSchema, "payments");

/** @typedef {ReturnType<typeof Payment.hydrate>} PaymentDocument */

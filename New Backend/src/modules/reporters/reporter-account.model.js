// Mobile-app reporters' standing — docs/02 §10, docs/11 §6. Kept in
// `reward_accounts`, which this system writes and the app reads: the app
// stops a suspended citizen from sending reports. It also carries the reward
// balance and latest ledger lines (docs/16), kept by the rewards module.

import mongoose from "mongoose";

export const REPORTER_STATUSES = /** @type {const} */ (["active", "flagged", "suspended"]);

const accountSchema = new mongoose.Schema(
  {
    /** The citizen's account id in the app. */
    userId: { type: String, required: true, unique: true },
    status: { type: String, enum: REPORTER_STATUSES, required: true, default: "active" },
    /** Why it is flagged or suspended, in words HQ wrote or the rule that applied. */
    statusReason: { type: String, default: null },
    statusChangedAt: { type: Date, default: null },
    statusChangedBy: { type: String, default: null },
    history: {
      type: [
        new mongoose.Schema(
          {
            at: { type: Date, required: true },
            status: { type: String, enum: REPORTER_STATUSES, required: true },
            by: { type: String, required: true },
            reason: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    // ── Rewards (docs/16, docs/11 §6) — written by the rewards module ──
    /** Points by state, as the app shows them. Held points count as pending. */
    balance: {
      type: new mongoose.Schema(
        {
          pending: { type: Number, default: 0 },
          /** Confirmed and not held, less any recovery — what can be paid out. */
          available: { type: Number, default: 0 },
          /** Set aside for a payout request not yet paid. */
          inPayout: { type: Number, default: 0 },
          paidOut: { type: Number, default: 0 },
          /** Available points that lapse within 30 days. */
          expiringSoon: { type: Number, default: 0 },
          updatedAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    /** The latest reward lines, newest first, for the app (plain words only). */
    ledger: {
      type: [
        new mongoose.Schema(
          {
            reportNumber: String,
            points: Number,
            status: String,
            message: { type: String, default: null },
            at: Date,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    /** The latest payout requests and their state, newest first (docs/11 §6). */
    payouts: {
      type: [
        new mongoose.Schema(
          {
            requestId: mongoose.Schema.Types.ObjectId,
            status: String,
            points: Number,
            amount: Number,
            reference: { type: String, default: null },
            message: { type: String, default: null },
            at: Date,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    /** Payouts stopped (fabricated evidence) or rewards ended for good (§7). */
    rewards: {
      type: new mongoose.Schema(
        {
          frozen: { type: Boolean, default: false },
          excluded: { type: Boolean, default: false },
          fabricatedCount: { type: Number, default: 0 },
          reason: { type: String, default: null },
          changedAt: { type: Date, default: null },
          changedBy: { type: String, default: null },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
  },
  { timestamps: true, versionKey: false },
);
accountSchema.index({ status: 1, statusChangedAt: -1 });

export const ReporterAccount = mongoose.model("ReporterAccount", accountSchema, "reward_accounts");

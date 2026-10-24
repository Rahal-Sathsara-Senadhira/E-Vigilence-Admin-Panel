// Reward payouts — docs/16 §6. A citizen asks in the app (`payout_requests`,
// docs/11 §6); this system sets aside their available points, finance pays
// them in weekly batches, and the result goes back to the app through
// `reward_accounts`. Simulated: no money moves (D16-10).
//
//   requested ─► batched ─► paid
//       │            └────► failed ─► (retry) paid · rejected
//       └─► rejected (with the reason)

import mongoose from "mongoose";

export const PAYOUT_STATUSES = /** @type {const} */ ([
  "requested",
  "batched",
  "paid",
  "failed",
  "rejected",
]);

const payoutSchema = new mongoose.Schema(
  {
    /** The app's `payout_requests` document. */
    requestId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    /** bank · wallet */
    method: { type: String, enum: ["bank", "wallet"], required: true },
    /** Only the last digits are kept here; the full number stays in the app. */
    accountMasked: { type: String, required: true },
    points: { type: Number, required: true },
    amount: { type: Number, required: true },
    /** The entries set aside for it (awards and recoveries). */
    entryIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    status: { type: String, enum: PAYOUT_STATUSES, required: true, index: true },
    /** What the citizen is told when it is rejected or fails. */
    reason: { type: String, default: null },
    /** Less than all available points: the monthly cap was reached (D16-5). */
    capped: { type: Boolean, default: false },
    batchId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    reference: { type: String, default: null },
    paidAt: { type: Date, default: null },
    requestedAt: { type: Date, required: true },
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
payoutSchema.index({ status: 1, requestedAt: 1 });

export const Payout = mongoose.model("Payout", payoutSchema, "reward_payouts");

const batchSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true },
    /** prepared · approved · cancelled */
    status: { type: String, required: true },
    payoutIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    points: { type: Number, required: true },
    amount: { type: Number, required: true },
    preparedBy: {
      type: new mongoose.Schema(
        { id: mongoose.Schema.Types.ObjectId, name: String },
        { _id: false },
      ),
      required: true,
    },
    preparedAt: { type: Date, required: true },
    approvedBy: {
      type: new mongoose.Schema(
        { id: mongoose.Schema.Types.ObjectId, name: String },
        { _id: false },
      ),
      default: null,
    },
    approvedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);
batchSchema.index({ status: 1, preparedAt: -1 });

export const PayoutBatch = mongoose.model("PayoutBatch", batchSchema, "reward_payout_batches");

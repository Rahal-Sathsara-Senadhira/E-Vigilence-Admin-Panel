// Mobile-app reporters' standing — docs/02 §10, docs/11 §6. Kept in
// `reward_accounts`, which this system writes and the app reads: the app
// stops a suspended citizen from sending reports. Balances and the reward
// ledger join this document with citizen rewards (N8, docs/16).

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
  },
  { timestamps: true, versionKey: false },
);
accountSchema.index({ status: 1, statusChangedAt: -1 });

export const ReporterAccount = mongoose.model("ReporterAccount", accountSchema, "reward_accounts");

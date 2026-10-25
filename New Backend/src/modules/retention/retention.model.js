// Data retention — docs/10 §6. The switch (off until the legal review
// confirms the schedule, D10-2, D10-8), each run, and the app accounts whose
// deletion was carried out (§5.5).

import mongoose from "mongoose";

const settingSchema = new mongoose.Schema(
  {
    effectiveFrom: { type: Date, required: true },
    enabled: { type: Boolean, required: true },
    changedBy: { type: String, required: true },
    changedById: { type: mongoose.Schema.Types.ObjectId, default: null },
    reason: { type: String, required: true },
  },
  { versionKey: false },
);
settingSchema.index({ effectiveFrom: -1 });
export const RetentionSetting = mongoose.model(
  "RetentionSetting",
  settingSchema,
  "retention_settings",
);

const runSchema = new mongoose.Schema(
  {
    /** monthly · manual */
    trigger: { type: String, required: true },
    by: { type: String, required: true },
    /** Per rule: records handled, and those held back (legal hold). */
    results: {
      type: [
        new mongoose.Schema(
          {
            rule: String,
            label: String,
            done: Number,
            held: Number,
            failed: Number,
            /** The first failures, so HQ can see why. */
            problems: { type: [String], default: [] },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
  },
  { versionKey: false },
);
runSchema.index({ startedAt: -1 });
export const RetentionRun = mongoose.model("RetentionRun", runSchema, "retention_runs");

/** App accounts deleted by their owner and anonymised here (§5.5) — each once. */
const deletionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    token: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { versionKey: false },
);
export const AccountDeletion = mongoose.model(
  "AccountDeletion",
  deletionSchema,
  "account_deletions_done",
);

// Demerit points — docs/08. Three records:
//  - setting versions: the switch (off by default) and the thresholds,
//    changed by HQ with a reason; an outcome uses the version in force when
//    it became final, so turning the scheme on is never retroactive (D08-1);
//  - the ledger: points recorded (positive) or removed (negative), each with
//    why, the offence date and when it expires (24 months, D08-4);
//  - each person's standing: the current total, the threshold flag and the
//    referral to the Department of Motor Traffic. The system flags and
//    records; it never suspends a licence (D08-6).

import mongoose from "mongoose";

const settingSchema = new mongoose.Schema(
  {
    effectiveFrom: { type: Date, required: true },
    enabled: { type: Boolean, required: true },
    /** D08-5 (to be confirmed against the official scheme). */
    warnAt: { type: Number, required: true },
    referAt: { type: Number, required: true },
    changedBy: { type: String, required: true },
    changedById: { type: mongoose.Schema.Types.ObjectId, default: null },
    reason: { type: String, required: true },
  },
  { versionKey: false },
);
settingSchema.index({ effectiveFrom: -1 });
export const DemeritSetting = mongoose.model("DemeritSetting", settingSchema, "demerit_settings");

const entrySchema = new mongoose.Schema(
  {
    personId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    /** Positive when recorded, negative when removed. */
    points: { type: Number, required: true },
    offenceCodes: { type: [String], default: [] },
    caseId: { type: mongoose.Schema.Types.ObjectId, required: true },
    caseNumber: { type: String, required: true },
    /** What made it final: a paid notice or a court conviction. */
    source: {
      type: new mongoose.Schema(
        {
          /** notice · court_case */
          type: { type: String, required: true },
          id: { type: mongoose.Schema.Types.ObjectId, required: true },
          number: { type: String, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    offenceDate: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    recordedBy: { type: String, required: true },
    /** For a removal: why, and the entry it cancels. */
    reason: { type: String, default: null },
    cancels: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: { createdAt: "recordedAt", updatedAt: false }, versionKey: false },
);
entrySchema.index({ "source.id": 1 });
entrySchema.index({ expiresAt: 1 });
export const DemeritEntry = mongoose.model("DemeritEntry", entrySchema, "demerit_entries");

const standingSchema = new mongoose.Schema(
  {
    personId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    total: { type: Number, default: 0 },
    /** none · approaching (≥ warnAt) · threshold (≥ referAt) */
    flag: { type: String, default: "none" },
    flaggedAt: { type: Date, default: null },
    /** HQ's referral to the Department of Motor Traffic (§7). */
    referral: {
      type: new mongoose.Schema(
        {
          reference: { type: String, required: true },
          referredOn: { type: Date, required: true },
          by: { type: String, required: true },
          at: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true, versionKey: false },
);
standingSchema.index({ flag: 1, total: -1 });
export const DemeritStanding = mongoose.model(
  "DemeritStanding",
  standingSchema,
  "demerit_standings",
);

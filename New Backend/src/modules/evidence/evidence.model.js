// Evidence items — docs/10 §3. The original is kept as received, with its
// SHA-256 fingerprint; a custody log records every handling. Never edited
// or replaced (E1): a better copy is a new item.

import mongoose from "mongoose";

const custodySchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    event: { type: String, required: true },
    by: { type: String, required: true },
    byId: { type: mongoose.Schema.Types.ObjectId, default: null },
    note: { type: String, default: null },
  },
  { _id: false },
);

const evidenceSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["photo", "video", "audio"], required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true },
    originalKey: { type: String, required: true },
    /** The everyday viewing copy. The original until compressed copies exist (TODO.md). */
    viewKey: { type: String, required: true },
    originalName: { type: String, default: null },
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: "Report", default: null, index: true },
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: "Case", default: null, index: true },
    receivedVia: { type: String, required: true },
    uploadedBy: {
      type: new mongoose.Schema(
        {
          id: { type: mongoose.Schema.Types.ObjectId, default: null },
          name: { type: String, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    /** From the mobile app: recorded with the app's camera (true) or picked from the gallery. */
    capturedInApp: { type: Boolean, default: null },
    /** From the mobile app: when the app says the file was recorded. */
    capturedAt: { type: Date, default: null },
    custody: { type: [custodySchema], default: [] },
    /**
     * The files were deleted at the end of the retention period (docs/10 §6);
     * this record stays, with its fingerprint and custody log.
     */
    deletedAt: { type: Date, default: null },
    deletedRule: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

export const Evidence = mongoose.model("Evidence", evidenceSchema, "evidence");

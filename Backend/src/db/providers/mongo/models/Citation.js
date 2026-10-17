import mongoose from "mongoose";

// The actual enforcement consequence of a violation being verified
// (VIOLATIONS_BUSINESS_LOGIC.md #4) — created automatically the moment a
// Violation transitions to "verified" (see modules/citations/citations.service.js).
const CitationSchema = new mongoose.Schema(
  {
    violation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Violation",
      required: true,
      index: true,
    },
    citationNumber: { type: String, required: true, unique: true },

    // Copied from the catalog entry at verification time, not a live
    // reference — a later catalog price change must not retroactively alter
    // a citation that was already issued.
    fineAmount: { type: Number, default: null },

    dueDate: { type: Date, required: true },

    // "void" is set only by the system, when the verification behind the
    // citation is overturned or the violation is deleted — never by a manual
    // payment-status update (see citations.controller.js).
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "appealed", "waived", "void"],
      default: "unpaid",
    },

    issuedBy: { type: String, default: null },

    // Set together when the citation is voided. Deliberately no default on
    // voidedAt: the partial unique index below relies on it being absent on
    // active citations.
    voidedAt: { type: Date },
    voidReason: { type: String, default: null },
    voidedBy: { type: String, default: null },
    paymentStatusBeforeVoid: { type: String, default: null },
  },
  { timestamps: true }
);

// At most one active (non-voided) citation per violation — the database-level
// guard against double-issuing when two verify requests race.
CitationSchema.index(
  { violation: 1 },
  { unique: true, partialFilterExpression: { voidedAt: { $exists: false } } }
);

const Citation = mongoose.models.Citation || mongoose.model("Citation", CitationSchema);
export default Citation;

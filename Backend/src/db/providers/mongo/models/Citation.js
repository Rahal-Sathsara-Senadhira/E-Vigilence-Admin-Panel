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

    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "appealed", "waived"],
      default: "unpaid",
    },

    issuedBy: { type: String, default: null },
  },
  { timestamps: true }
);

const Citation = mongoose.models.Citation || mongoose.model("Citation", CitationSchema);
export default Citation;

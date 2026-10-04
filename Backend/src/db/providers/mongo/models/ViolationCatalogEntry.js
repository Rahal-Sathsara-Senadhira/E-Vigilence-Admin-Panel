import mongoose from "mongoose";

// The controlled vocabulary Violation.violations[] refs into, replacing
// free-typed strings (see VIOLATIONS_BUSINESS_LOGIC.md #1). Entries can be
// created two ways: HQ manages them directly via /api/violation-catalog, or
// they're auto-created (fineAmount left null for HQ to fill in) when a
// not-yet-seen name comes through resolveCatalogEntries() — legacy data
// migration or a citizen app's free-text issueType.
const ViolationCatalogEntrySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    legalCode: { type: String, default: null, trim: true },
    fineAmount: { type: Number, default: null },
    severity: {
      type: String,
      enum: ["minor", "moderate", "severe"],
      default: "moderate",
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const ViolationCatalogEntry =
  mongoose.models.ViolationCatalogEntry ||
  mongoose.model("ViolationCatalogEntry", ViolationCatalogEntrySchema);

export default ViolationCatalogEntry;

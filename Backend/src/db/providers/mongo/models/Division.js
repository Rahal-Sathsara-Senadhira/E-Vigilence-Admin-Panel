import mongoose from "mongoose";

// A territorial police division (SSP/SP command) — the "regional office"
// level of Sri Lanka Police. Every verified police station belongs to one.
// Province (SDIG) and range (DIG) are kept as plain labels for grouping and
// reporting. Seeded from seeds/divisions.seed.js; HQ can add or edit them.
const DivisionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    range: { type: String, required: true, trim: true },
    province: { type: String, required: true, trim: true },

    // Approximate HQ-town coordinate — only used to *suggest* a division
    // for an imported station awaiting verification.
    anchor: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

DivisionSchema.index({ province: 1, range: 1, name: 1 });

const Division = mongoose.models.Division || mongoose.model("Division", DivisionSchema);
export default Division;

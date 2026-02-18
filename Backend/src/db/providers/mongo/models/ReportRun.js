import mongoose from "mongoose";

// A saved (auditable) report snapshot.
// Stores filters + computed summary + the exact set of violation ids used.

const ReportRunSchema = new mongoose.Schema(
  {
    name: { type: String, default: null, trim: true },

    // Filters used to generate the report
    filters: {
      from: { type: Date, default: null },
      to: { type: Date, default: null },
      status: { type: String, default: null, trim: true },
      category: { type: String, default: null, trim: true },
    },

    // Computed summary snapshot (what you display on the reports page)
    snapshot: {
      kpis: {
        total: { type: Number, default: 0 },
        open: { type: Number, default: 0 },
        in_review: { type: Number, default: 0 },
        resolved: { type: Number, default: 0 },
      },
      byCategory: [{ category: String, count: Number }],
      byDay: [{ day: String, count: Number }],
    },

    // Exact set used to generate snapshot/export.
    // (Keeps report stable even if new violations are added later.)
    violationIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Violation" }],

    createdBy: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

ReportRunSchema.index({ createdAt: -1 });

const ReportRun =
  mongoose.models.ReportRun || mongoose.model("ReportRun", ReportRunSchema);

export default ReportRun;

import mongoose from "mongoose";

// Citizen reports HQ has deliberately deleted from the Violations list.
// The background sync (citizenReportSync.js) imports every report that has
// no Violation yet, so without this list a deleted one would simply be
// re-imported within a minute. Owned by this app; the citizen app never
// reads it.
const CitizenReportSkipSchema = new mongoose.Schema(
  {
    reportId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    reason: { type: String, default: "deleted" },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true, collection: "citizenreportskips" }
);

const CitizenReportSkip =
  mongoose.models.CitizenReportSkip ||
  mongoose.model("CitizenReportSkip", CitizenReportSkipSchema);

export default CitizenReportSkip;

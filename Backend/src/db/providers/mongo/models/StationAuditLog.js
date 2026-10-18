import mongoose from "mongoose";

// Every change to a police station — who, what, when — shown on the
// station's Settings tab. `changes` holds { field: { from, to } } for
// edits; `meta` holds action-specific details (e.g. how many cases were
// reassigned on deactivation).
const StationAuditLogSchema = new mongoose.Schema(
  {
    station: { type: mongoose.Schema.Types.ObjectId, ref: "PoliceStation", required: true, index: true },
    action: {
      type: String,
      enum: ["created", "updated", "verified", "jurisdiction", "deactivated", "reactivated", "imported"],
      required: true,
    },
    changes: { type: Object, default: {} },
    meta: { type: Object, default: {} },
    by: { type: String, default: null },
    byRole: { type: String, default: null },
  },
  { timestamps: true }
);

StationAuditLogSchema.index({ station: 1, createdAt: -1 });

const StationAuditLog =
  mongoose.models.StationAuditLog || mongoose.model("StationAuditLog", StationAuditLogSchema);
export default StationAuditLog;

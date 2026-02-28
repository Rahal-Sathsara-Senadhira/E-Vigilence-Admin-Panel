import mongoose from "mongoose";

const LocationSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    dms: { type: String, default: null },
  },
  { _id: false }
);

const ViolationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },

    // ✅ NEW: store multiple selected violations
    violations: [{ type: String, trim: true }],

    description: { type: String, default: "" },

    location: { type: LocationSchema, required: true },

    reported_by: { type: String, default: null },
    status: { type: String, default: "pending" },

    images: [{ type: String }],

    // ✅ Station access control (added without changing existing behavior)
    assignedStation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PoliceStation",
      default: null,
    },
    assignedAt: { type: Date, default: null },
    assignedBy: { type: String, default: null },
    stationNote: { type: String, default: "" },
  },
  { timestamps: true }
);

ViolationSchema.index({ type: 1, createdAt: -1 });

const Violation = mongoose.models.Violation || mongoose.model("Violation", ViolationSchema);
export default Violation;
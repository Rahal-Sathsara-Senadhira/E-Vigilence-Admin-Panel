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
    description: { type: String, default: "" },

    location: { type: LocationSchema, required: true },

    reported_by: { type: String, default: null },
    status: { type: String, default: "pending" },

    images: [{ type: String }],
  },
  { timestamps: true }
);

ViolationSchema.index({ type: 1, createdAt: -1 });

const Violation = mongoose.models.Violation || mongoose.model("Violation", ViolationSchema);
export default Violation;

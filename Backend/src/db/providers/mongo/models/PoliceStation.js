import mongoose from "mongoose";

const PoliceStationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    area: { type: String, default: "", trim: true },

    // ✅ GeoJSON (required for $near / $geoNear)
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
  },
  { timestamps: true }
);

// ✅ Important: 2dsphere index for geo queries
PoliceStationSchema.index({ location: "2dsphere" });

// optional uniqueness to prevent duplicates
PoliceStationSchema.index({ name: 1, area: 1 }, { unique: true });

const PoliceStation =
  mongoose.models.PoliceStation || mongoose.model("PoliceStation", PoliceStationSchema);

export default PoliceStation;
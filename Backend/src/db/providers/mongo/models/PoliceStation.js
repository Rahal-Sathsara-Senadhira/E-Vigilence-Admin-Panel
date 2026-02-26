import mongoose from "mongoose";

const PoliceStationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    address: { type: String, default: "" },
    phone: { type: String, default: "" },

    // GeoJSON Point: coordinates are [lng, lat]
    location: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (arr) => Array.isArray(arr) && arr.length === 2,
          message: "location.coordinates must be [lng, lat]",
        },
      },
    },
  },
  { timestamps: true }
);

// CRITICAL for $near queries
PoliceStationSchema.index({ location: "2dsphere" });

export default mongoose.model("PoliceStation", PoliceStationSchema);
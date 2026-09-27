import mongoose from "mongoose";

const PoliceStationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    area: { type: String, default: "" },
    address: { type: String, default: "" },
    phone: { type: String, default: "" },
    code: { type: String, default: null },
    district: { type: String, default: null },
    province: { type: String, default: null },
    isActive: { type: Boolean, default: true },

    // Optional link to the regional tier above this station.
    regionalStationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RegionalStation",
      default: null,
    },

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
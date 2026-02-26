import mongoose from "mongoose";

const PoliceStationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, default: null, trim: true }, // optional station code
    phone: { type: String, default: null, trim: true },

    address: { type: String, default: null, trim: true },
    district: { type: String, default: null, trim: true },
    province: { type: String, default: null, trim: true },

    // Geo
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        // [lng, lat]
        type: [Number],
        default: undefined,
      },
    },
    dms: { type: String, default: null, trim: true }, // store original DMS if you want

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Needed for "nearest station" later
PoliceStationSchema.index({ location: "2dsphere" });

export default mongoose.model("PoliceStation", PoliceStationSchema);
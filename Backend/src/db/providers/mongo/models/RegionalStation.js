import mongoose from "mongoose";

const RegionalStationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, default: null, trim: true },

    region: { type: String, default: "", trim: true }, // optional (province/district/region)
    address: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true },

    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      dms: { type: String, default: "" }, // if you store DMS too
    },
  },
  { timestamps: true }
);

// Helpful indexes
RegionalStationSchema.index({ name: 1, region: 1 });
RegionalStationSchema.index({ code: 1 });

const RegionalStation =
  mongoose.models.RegionalStation ||
  mongoose.model("RegionalStation", RegionalStationSchema);

export default RegionalStation;
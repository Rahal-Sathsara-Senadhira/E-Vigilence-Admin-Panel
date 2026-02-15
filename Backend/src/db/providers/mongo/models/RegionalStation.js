import mongoose from "mongoose";

const RegionalStationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, default: null, trim: true },
    address: { type: String, default: "" },
    phone: { type: String, default: "" },
  },
  { timestamps: true }
);

RegionalStationSchema.index({ name: 1 });

// Prevent model overwrite on nodemon reload
const RegionalStation =
  mongoose.models.RegionalStation || mongoose.model("RegionalStation", RegionalStationSchema);

export default RegionalStation;

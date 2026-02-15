import mongoose from "mongoose";

const SettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

SettingSchema.index({ key: 1 }, { unique: true });

const Setting = mongoose.models.Setting || mongoose.model("Setting", SettingSchema);
export default Setting;

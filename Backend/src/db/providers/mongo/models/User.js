import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    password_hash: { type: String, required: true },

    role: {
      type: String,
      enum: ["hq", "station_admin", "station_officer"],
      default: "hq",
      required: true,
    },

    // REQUIRED for station roles
    stationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PoliceStation",
      default: null,
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("User", UserSchema);
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    email: { type: String, required: true, lowercase: true, trim: true, unique: true },

    // The `users` collection is shared with the citizen app
    // (E-Vigilance-Client), which puts a unique index on `nic`. A missing NIC
    // counts as null for that index, so only ONE account in the whole
    // collection may lack it — every staff account needs its own NIC.
    // No default: storing an explicit null would collide the same way.
    nic: { type: String, trim: true },
    password_hash: { type: String, required: true },
    avatarUrl: { type: String, default: null },

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

    nic: { type: String },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("User", UserSchema);
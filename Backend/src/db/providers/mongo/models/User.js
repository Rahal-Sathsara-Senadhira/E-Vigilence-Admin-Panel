import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    full_name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone_number: { type: String, default: null },
    nic_number: { type: String, default: null },

    role: { type: String, default: "user" },
    station_id: { type: String, default: null },

    is_active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

UserSchema.index({ email: 1 }, { unique: true });

const User = mongoose.models.User || mongoose.model("User", UserSchema);
export default User;

import mongoose from "mongoose";
import { MONGO_URI } from "../../config/env.js";
import User from "../providers/mongo/models/User.js";
import { hashPassword } from "../../utils/password.js";

async function resetStationPasswords() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected ✅");

    const defaultPassword = "station123";
    const newHash = hashPassword(defaultPassword);

    const result = await User.updateMany(
      { role: { $in: ["station_admin", "station_officer"] } },
      {
        $set: {
          password_hash: newHash,
          isActive: true,
          status: "active",
        },
      }
    );

    console.log("✅ Updated station users:", result.modifiedCount);
    console.log("Default station password:", defaultPassword);

    process.exit(0);
  } catch (err) {
    console.error("❌ Reset failed:", err);
    process.exit(1);
  }
}

resetStationPasswords();
import mongoose from "mongoose";
import { MONGO_URI } from "../../config/env.js";

import User from "../providers/mongo/models/User.js";
import { hashPassword } from "../../utils/password.js";

async function seedAdminUser() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected ✅");

    const email = "admin@evigilance.com";
    const password = "admin123";

    const password_hash = hashPassword(password);

    const existing = await User.findOne({ email });

    if (!existing) {
      const admin = await User.create({
        name: "Alex Ortega",
        email,
        role: "hq",          // ✅ IMPORTANT: use "hq" (allowed by schema)
        stationId: null,
        isActive: true,
        password_hash,
      });

      console.log("✅ Admin CREATED:", {
        id: admin._id.toString(),
        email,
        password,
        role: admin.role,
      });

      process.exit(0);
    }

    // ✅ If admin already exists, FIX it (password + role + active flags)
    existing.name = existing.name || "Alex Ortega";
    existing.role = "hq";
    existing.stationId = null;
    existing.isActive = true;
    existing.password_hash = password_hash;

    await existing.save();

    console.log("✅ Admin UPDATED:", {
      id: existing._id.toString(),
      email,
      password,
      role: existing.role,
    });

    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  }
}

seedAdminUser();
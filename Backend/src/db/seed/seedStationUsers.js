import mongoose from "mongoose";
import { MONGO_URI } from "../../config/env.js";

import PoliceStation from "../providers/mongo/models/PoliceStation.js";
import User from "../providers/mongo/models/User.js";
import { hashPassword } from "../../utils/password.js";

async function seedStationUsers() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected ✅");

    const stations = await PoliceStation.find();
    if (!stations.length) {
      console.log("No police stations found.");
      process.exit(0);
    }

    const defaultPassword = "station123";
    const password_hash = hashPassword(defaultPassword);

    for (const station of stations) {
      const normalizedName = String(station.name || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ".")
        .replace(/[^a-z0-9.]/g, "");

      const email = `${normalizedName}@evigilance.lk`;

      const existing = await User.findOne({ email });
      if (existing) {
        console.log(`⏭ Skipped (already exists): ${email}`);
        continue;
      }

      await User.create({
        name: `${station.name} Admin`,
        email,
        // Placeholder, unique per station — users.nic is unique across the
        // collection shared with the citizen app (see models/User.js).
        nic: `SEED-STATION-${station._id}`,
        role: "station_admin",

        // your DB has stationId field (as in screenshot)
        stationId: station._id,

        // support both styles so auth won’t block
        isActive: true,
        status: "active",

        // IMPORTANT: scrypt format
        password_hash,
      });

      console.log(`✅ Created station user: ${email}`);
    }

    console.log("\n🎉 Seeding complete!");
    console.log("Default password for all station users: station123");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  }
}

seedStationUsers();
import mongoose from "mongoose";
import { MONGO_URI } from "./src/config/env.js";
import User from "./src/db/providers/mongo/models/User.js";
import PoliceStation from "./src/db/providers/mongo/models/PoliceStation.js";
import { hashPassword } from "./src/utils/password.js";

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    
    // Find a police station to assign the officer to
    const station = await PoliceStation.findOne();
    if (!station) {
      console.log("No police stations found. Run 'npm run seed:stations' first.");
      process.exit(1);
    }

    const email = "officer@evigilance.com";
    const password = "officerpassword";
    const password_hash = hashPassword(password);

    // Create or update the dummy officer
    const officer = await User.findOneAndUpdate(
      { email },
      {
        name: "Dummy Officer",
        email,
        password_hash,
        role: "station_officer",
        stationId: station._id,
        isActive: true,
      },
      { upsert: true, new: true }
    );

    console.log("Dummy officer seeded successfully:");
    console.log("- Email: " + email);
    console.log("- Password: " + password);
    console.log("- Assigned Station: " + station.name + " (" + station.area + ")");

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();

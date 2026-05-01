import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import PoliceStation from "./src/db/providers/mongo/models/PoliceStation.js";
import Violation from "./src/db/providers/mongo/models/Violation.js";
import Dispatch from "./src/db/providers/mongo/models/Dispatch.js";

await mongoose.connect(process.env.MONGO_URI);
console.log("✅ Connected to MongoDB\n");

try {
  // Use the hardcoded station ID from auth.js demo token
  const GALLE_STATION_ID = "69f093ba202797ff80a6cfcd";

  // Find Galle station
  const galleStation = await PoliceStation.findById(GALLE_STATION_ID);

  if (!galleStation) {
    console.log("❌ Galle Police Station NOT FOUND in database!");
    console.log("Run: node create-test-dispatches.js first\n");
  } else {
    console.log("✅ Found Galle Police Station");
    console.log(`   ID: ${galleStation._id}`);
    console.log(`   Name: ${galleStation.name}\n`);

    // Check dispatches
    const dispatchCount = await Dispatch.countDocuments({ station: galleStation._id });
    console.log(`📨 Dispatches for Galle: ${dispatchCount}`);

    if (dispatchCount > 0) {
      const dispatches = await Dispatch.find({ station: galleStation._id })
        .populate("violation")
        .populate("station");

      dispatches.forEach((d, i) => {
        console.log(`   [${i + 1}] Violation: ${d.violation?.title} (Status: ${d.status})`);
      });
    }

    // Check assigned violations
    console.log(`\n📝 Violations assigned to Galle:`);
    const violations = await Violation.find({ assignedStation: galleStation._id });
    console.log(`   Total: ${violations.length}`);

    violations.forEach((v, i) => {
      console.log(`   [${i + 1}] ${v.title} (Status: ${v.status})`);
    });

    console.log("\n═══════════════════════════════════════");
    console.log("🔑 USE THIS STATION ID IN DEMO TOKEN:");
    console.log(`   ${galleStation._id}`);
    console.log("═══════════════════════════════════════");
  }

} catch (error) {
  console.error("❌ Error:", error.message);
}

await mongoose.disconnect();
process.exit(0);

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import PoliceStation from "./src/db/providers/mongo/models/PoliceStation.js";
import Violation from "./src/db/providers/mongo/models/Violation.js";
import Dispatch from "./src/db/providers/mongo/models/Dispatch.js";

await mongoose.connect(process.env.MONGO_URI);
console.log("✅ Connected to MongoDB\n");

try {
  // 1️⃣ Use the hardcoded Galle station ID from auth.js
  // This ID is in auth.js demo-station-token, so must match!
  const GALLE_STATION_ID = "69f093ba202797ff80a6cfcd";

  let galleStation = await PoliceStation.findById(GALLE_STATION_ID);

  if (!galleStation) {
    console.log("⚠️  Station with ID not found. Creating new station...");
    galleStation = await PoliceStation.create({
      _id: GALLE_STATION_ID,
      name: "Galle Police Station",
      code: "GLL-01",
      address: "Main Street, Galle",
      phone: "091-1234567",
      area: "Galle",
      location: {
        type: "Point",
        coordinates: [80.2210, 6.0535],
      },
    });
    console.log("✅ Created Galle Police Station");
  } else {
    console.log("✅ Found existing Galle Police Station");
  }

  console.log(`   ID: ${galleStation._id}`);
  console.log(`   Name: ${galleStation.name}\n`);

  // 2️⃣ Create test violations for this station
  console.log("\n📝 Creating test violations...");

  const violations = await Violation.insertMany([
    {
      title: "Speed Violation - MH01AB1234",
      type: "Traffic",
      violations: ["Speeding"],
      description: "Vehicle speeding on Main Road. Speed: 80 km/h in 50 km/h zone.",
      location: {
        lat: 6.0540,
        lng: 80.2205,
      },
      reported_by: "Officer John",
      status: "open",
    },
    {
      title: "Parking Violation - MH02CD5678",
      type: "Parking",
      violations: ["Illegal Parking"],
      description: "Vehicle parked in no-parking zone near market.",
      location: {
        lat: 6.0535,
        lng: 80.2215,
      },
      reported_by: "Officer Sarah",
      status: "open",
    },
    {
      title: "Traffic Light Violation - KA03EF9012",
      type: "Traffic",
      violations: ["Red Light Jump"],
      description: "Vehicle ran red light at main junction.",
      location: {
        lat: 6.0545,
        lng: 80.2220,
      },
      reported_by: "Officer Mike",
      status: "pending",
    },
  ]);

  console.log(`✅ Created ${violations.length} test violations`);
  violations.forEach((v, i) => {
    console.log(`  [${i + 1}] ${v.title} (${v._id})`);
  });

  // 3️⃣ Create dispatches for these violations
  console.log("\n📨 Creating test dispatches...");

  const dispatches = await Dispatch.insertMany([
    {
      violation: violations[0]._id,
      station: galleStation._id,
      status: "sent",
      sentAt: new Date(),
    },
    {
      violation: violations[1]._id,
      station: galleStation._id,
      status: "sent",
      sentAt: new Date(Date.now() - 3600000), // 1 hour ago
    },
    {
      violation: violations[2]._id,
      station: galleStation._id,
      status: "sent",
      sentAt: new Date(Date.now() - 86400000), // 1 day ago
    },
  ]);

  console.log(`✅ Created ${dispatches.length} test dispatches`);

  // 4️⃣ Update violations with assigned station
  console.log("\n🔗 Linking violations to station...");

  await Violation.updateMany(
    { _id: { $in: violations.map((v) => v._id) } },
    { assignedStation: galleStation._id, assignedAt: new Date() }
  );

  console.log("✅ Violations linked to Galle station\n");

  // 5️⃣ Summary
  console.log("═══════════════════════════════════════");
  console.log("✅ TEST DATA CREATED SUCCESSFULLY!");
  console.log("═══════════════════════════════════════");
  console.log(`Station ID: ${galleStation._id}`);
  console.log(`Station Name: ${galleStation.name}`);
  console.log(`\nTest Violations: ${violations.length}`);
  console.log(`Test Dispatches: ${dispatches.length}`);
  console.log("\n📱 Login as station admin with:");
  console.log("  Email: station@galle.police");
  console.log("  Password: station123");
  console.log("\nYou should now see:");
  console.log("  - Inbox: 3 dispatches sent to Galle station");
  console.log("  - Assigned Violations: 3 violations assigned to your station");
  console.log("═══════════════════════════════════════\n");

} catch (error) {
  console.error("❌ Error:", error.message);
}

await mongoose.disconnect();
process.exit(0);

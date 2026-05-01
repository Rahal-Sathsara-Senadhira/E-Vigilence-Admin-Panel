import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import PoliceStation from "./src/db/providers/mongo/models/PoliceStation.js";
import Dispatch from "./src/db/providers/mongo/models/Dispatch.js";

await mongoose.connect(process.env.MONGO_URI);
console.log("Connected to MongoDB ✅");

// Find Galle station
const galleStation = await PoliceStation.findOne({ name: { $regex: "Galle", $options: "i" } });
console.log("Galle Station ID:", galleStation?._id);
console.log("Galle Station Name:", galleStation?.name);

// Find all dispatches
const dispatches = await Dispatch.find().populate("station").populate("violation");
console.log("\nTotal dispatches:", dispatches.length);

dispatches.forEach((d, i) => {
  console.log(`\n[${i}] Dispatch:`, {
    _id: d._id,
    stationId: d.station?._id,
    stationName: d.station?.name,
    violationId: d.violation?._id,
    violationTitle: d.violation?.title,
    createdAt: d.createdAt,
  });
});

// Check demo station ID vs Galle station ID
console.log("\n⚠️  DEMO STATION ID:", "69f093ba202797ff80a6cfa3");
console.log("Galle Station ID:  ", galleStation?._id?.toString());
console.log("Match?", galleStation?._id?.toString() === "69f093ba202797ff80a6cfa3");

await mongoose.disconnect();
console.log("\nDisconnected ✅");

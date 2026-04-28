import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import PoliceStation from "./src/db/providers/mongo/models/PoliceStation.js";
import Dispatch from "./src/db/providers/mongo/models/Dispatch.js";

await mongoose.connect(process.env.MONGO_URI);
console.log("Connected to MongoDB ✅\n");

// Find Galle station
const galleStation = await PoliceStation.findOne({ name: { $regex: "Galle", $options: "i" } });
console.log("Galle Station ID:", galleStation?._id);
console.log("Galle Station Name:", galleStation?.name);

// Find all dispatches for Galle without populate first
const allDispatches = await Dispatch.find({ station: galleStation?._id });
console.log("\nDispatches for Galle:", allDispatches.length);

allDispatches.forEach((d, i) => {
  console.log(`[${i}]`, {
    _id: d._id,
    station: d.station,
    violation: d.violation,
    createdAt: d.createdAt,
  });
});

// Now check all dispatches in the system
const totalDispatches = await Dispatch.find();
console.log("\nTotal dispatches in system:", totalDispatches.length);
totalDispatches.forEach((d, i) => {
  console.log(`[${i}]`, {
    _id: d._id,
    station: d.station,
    violation: d.violation,
    createdAt: d.createdAt,
  });
});

await mongoose.disconnect();

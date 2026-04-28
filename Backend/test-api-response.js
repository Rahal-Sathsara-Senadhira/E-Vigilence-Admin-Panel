import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Dispatch from "./src/db/providers/mongo/models/Dispatch.js";

await mongoose.connect(process.env.MONGO_URI);
console.log("Connected to MongoDB ✅\n");

const galleStationId = "69f093ba202797ff80a6cfcd";

// Simulate what the API endpoint does
const dispatches = await Dispatch.find({ station: galleStationId })
  .populate("violation")
  .populate("station")
  .sort({ createdAt: -1 });

console.log("Raw dispatches returned:", dispatches);
console.log("\nFormatted response (what API returns):");
console.log(JSON.stringify({ dispatches }, null, 2));

await mongoose.disconnect();

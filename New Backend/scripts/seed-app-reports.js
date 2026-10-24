// Demo mobile-app reports for development: writes to the app's own `reports`
// and `users` collections as the app would (docs/11 §4), so the import can be
// watched end to end. The running backend imports them within a minute.
//
//   npm run seed:app-reports
//
// Never runs in production — there, only the app writes these collections.

import mongoose from "mongoose";
import { loadEnv } from "#src/config/env.js";
import { connectDatabase, disconnectDatabase } from "#src/core/db/connection.js";

const env = loadEnv();
if (env.NODE_ENV === "production") throw new Error("Demo app reports never go into production.");
await connectDatabase({ uri: env.MONGODB_URI, dbName: env.MONGODB_DB_NAME });

const db = /** @type {import("mongodb").Db} */ (mongoose.connection.db);
const ago = (/** @type {number} */ hours) => new Date(Date.now() - hours * 3_600_000);
const run = Date.now().toString(36);

try {
  const userId = new mongoose.Types.ObjectId();
  await db.collection("users").insertOne({
    _id: userId,
    name: "Demo Citizen",
    phone: "0761234567",
    role: "citizen",
  });
  const base = { userId: String(userId), createdAt: new Date(), evidence: [] };
  const docs = [
    {
      ...base,
      clientReportId: `demo-${run}-1`,
      offenceIds: ["MTA-158"],
      occurredAt: ago(2),
      latitude: 6.9147,
      longitude: 79.8731,
      address: "Thimbirigasyaya Road, Colombo 5",
      vehicleNumber: "wp bfg 7731",
      vehicleType: "Motor bike",
      vehicleModel: "Bajaj Pulsar",
      description: "Rider and pillion without helmets, weaving through traffic.",
    },
    {
      // The old app: free-text offence, no clientReportId (docs/11 §9).
      ...base,
      issueType: "Parking on a pedestrian crossing",
      dateTime: ago(5),
      latitude: 7.2906,
      longitude: 80.6337,
      location: "Kandy town, near the clock tower",
      vehicleNumber: "CP-KX 22",
      vehicleType: "Van",
      additionalDetails: "A van parked on the crossing for twenty minutes.",
    },
    {
      ...base,
      clientReportId: `demo-${run}-3`,
      offenceIds: ["MTA-152A"],
      occurredAt: ago(1),
      latitude: 13.0827,
      longitude: 80.2707,
      address: "Chennai",
      vehicleNumber: "TN 01 AB 1234",
      vehicleType: "Car",
      description: "Driver on the phone while driving.",
    },
  ];
  docs.forEach((d, i) => (d.createdAt = new Date(Date.now() + i)));
  const res = await db.collection("reports").insertMany(docs);
  console.log(`Added ${res.insertedCount} app reports. The backend imports them within a minute.`);
} finally {
  await disconnectDatabase();
}

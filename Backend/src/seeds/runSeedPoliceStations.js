import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import PoliceStation from "../db/providers/mongo/models/PoliceStation.js";
import { POLICE_STATIONS } from "./policeStations.seed.js";

const normalize = (s) => {
  const lat = Number(s.lat);
  const lng = Number(s.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    name: String(s.name || "").trim(),
    area: String(s.area || "").trim(),
    location: { type: "Point", coordinates: [lng, lat] },
  };
};

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI missing in .env");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Mongo connected ✅");

  const stations = POLICE_STATIONS.map(normalize).filter(Boolean);

  const ops = stations.map((s) => ({
    updateOne: {
      filter: { name: s.name, area: s.area },
      update: { $set: s },
      upsert: true,
    },
  }));

  const r = await PoliceStation.bulkWrite(ops, { ordered: false });

  console.log({
    upserted: r.upsertedCount || 0,
    modified: r.modifiedCount || 0,
    matched: r.matchedCount || 0,
  });

  await mongoose.disconnect();
  console.log("Seed done ✅");
}

main().catch((e) => {
  console.error("Seed failed ❌", e);
  process.exit(1);
});
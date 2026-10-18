// One-off setup for the division / station overhaul:
//   1. Upserts the territorial divisions (seeds/divisions.seed.js).
//   2. Matches existing stations (the old 53-station seed) to the
//      OpenStreetMap dataset by name; a match within 5 km records the OSM
//      position as a *suggestion* (osmLocation) for HQ to accept in the
//      verification queue — pins are never moved silently.
//   3. Imports every remaining OSM station as an UNVERIFIED station.
//
// Idempotent (divisions by name, OSM stations by osmId) — safe to re-run.
// Dry run by default:
//   node src/db/migrations/seedDivisionsAndStations.js
//   node src/db/migrations/seedDivisionsAndStations.js --apply
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { connectMongo } from "../providers/mongo/index.js";
import Division from "../providers/mongo/models/Division.js";
import PoliceStation from "../providers/mongo/models/PoliceStation.js";
import StationAuditLog from "../providers/mongo/models/StationAuditLog.js";
import { DIVISIONS } from "../../seeds/divisions.seed.js";
import { distanceKm } from "../../utils/geo.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const osm = JSON.parse(fs.readFileSync(path.join(here, "../../seeds/data/osmPoliceStations.json"), "utf8"));

const key = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/\(.*?\)|police|station|headquarters|[^a-z]/g, "");

async function run() {
  const apply = process.argv.includes("--apply");
  await connectMongo();

  // 1. Divisions
  let divisionsCreated = 0;
  for (const d of DIVISIONS) {
    const exists = await Division.exists({ name: d.name });
    if (exists) continue;
    divisionsCreated++;
    if (apply) await Division.create(d);
  }

  // 2. Existing stations ↔ OSM
  const existing = await PoliceStation.find({}).lean();
  const usedOsm = new Set(existing.map((s) => s.osmId).filter(Boolean));
  let matched = 0;
  const suggestions = [];

  for (const s of existing) {
    const [lng, lat] = s.location?.coordinates || [];
    if (s.osmId || lat == null) continue;
    const candidate = osm.stations.find(
      (o) => !usedOsm.has(o.osmId) && key(o.name) === key(s.name) && distanceKm({ lat, lng }, o) < 5
    );
    if (!candidate) continue;

    usedOsm.add(candidate.osmId);
    matched++;
    const km = Math.round(distanceKm({ lat, lng }, candidate) * 100) / 100;
    suggestions.push(`${s.name}: OSM pin ${km} km away`);
    if (apply) {
      await PoliceStation.updateOne(
        { _id: s._id },
        {
          $set: {
            osmId: candidate.osmId,
            osmLocation: { lat: candidate.lat, lng: candidate.lng, distanceKm: km },
            source: s.source || "seed",
          },
        }
      );
    }
  }

  // 3. New stations from OSM
  const toImport = osm.stations.filter((o) => !usedOsm.has(o.osmId));
  if (apply) {
    for (const o of toImport) {
      const created = await PoliceStation.create({
        name: o.name,
        phone: o.phone || "",
        address: o.address || "",
        location: { type: "Point", coordinates: [o.lng, o.lat] },
        source: "osm",
        osmId: o.osmId,
        verified: false,
        isActive: true,
      });
      await StationAuditLog.create({
        station: created._id,
        action: "imported",
        meta: { source: "OpenStreetMap", osmId: o.osmId },
        by: null,
        byRole: "migration",
      });
    }
  }

  console.log(`Divisions: ${divisionsCreated} to create (${DIVISIONS.length} total in seed)`);
  console.log(`Existing stations: ${existing.length}; matched to OSM: ${matched}`);
  suggestions.slice(0, 15).forEach((s) => console.log(`  ${s}`));
  console.log(`OSM stations to import as unverified: ${toImport.length}`);
  console.log(apply ? "\nApplied." : "\nDry run — re-run with --apply to write.");

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

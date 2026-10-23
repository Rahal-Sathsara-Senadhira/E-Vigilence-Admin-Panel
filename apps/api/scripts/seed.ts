// Demo data for local development and staging (docs/17 §8). Never for production.
//
//   pnpm seed
//
// - the 44 territorial divisions (Sri Lanka Police Performance Report 2024);
// - 318 police stations from OpenStreetMap (© OpenStreetMap contributors,
//   ODbL 1.0), imported as unverified, as in the old system;
// - one demo account per role, all with the password in SEED_PASSWORD.
//   HQ and dev set up their authenticator app at first sign-in.
//
// Safe to run again: everything is matched by name, OSM id or email.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { passwordSchema, type StaffRole } from "@ev/shared";
import * as argon2 from "argon2";
import mongoose from "mongoose";
import { DIVISIONS } from "./data/divisions";

if (existsSync(".env")) process.loadEnvFile(".env");

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed demo data in production.");
  process.exit(1);
}

const uri = process.env.MONGODB_URI ?? "";
const password = process.env.SEED_PASSWORD ?? "";
if (!uri) throw new Error("Set MONGODB_URI (see .env.example).");
const pw = passwordSchema.safeParse(password);
if (!pw.success) throw new Error(`Set SEED_PASSWORD in .env: ${pw.error.issues[0]?.message}`);

interface OsmStation {
  name: string;
  lat: number;
  lng: number;
  osmId: string;
  phone: string;
  address: string;
}
const osm = JSON.parse(readFileSync(resolve("scripts/data/osmPoliceStations.json"), "utf8")) as {
  stations: OsmStation[];
};

async function main() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  const now = new Date();

  // Divisions
  let divisionsAdded = 0;
  for (const d of DIVISIONS) {
    const res = await db.collection("divisions").updateOne(
      { name: d.name },
      {
        $setOnInsert: {
          name: d.name,
          range: d.range,
          province: d.province,
          anchor: d.anchor,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
    divisionsAdded += res.upsertedCount;
  }

  // Stations
  let stationsAdded = 0;
  for (const s of osm.stations) {
    const res = await db.collection("policestations").updateOne(
      { osmId: s.osmId },
      {
        $setOnInsert: {
          name: s.name,
          osmId: s.osmId,
          source: "osm",
          verified: false,
          isActive: true,
          divisionId: null,
          address: s.address,
          phone: s.phone,
          email: "",
          location: { type: "Point", coordinates: [s.lng, s.lat] },
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
    stationsAdded += res.upsertedCount;
  }
  await db.collection("policestations").createIndex({ location: "2dsphere" });

  // Demo accounts
  const stationId = async (name: string) => {
    const s = await db.collection("policestations").findOne({ name });
    if (!s) throw new Error(`Seed station "${name}" not found`);
    return s._id;
  };
  const kandy = await stationId("Kandy Police Station");
  const galle = await stationId("Galle Police Station");

  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const demo: {
    name: string;
    email: string;
    nic: string;
    role: StaffRole;
    stationId: mongoose.Types.ObjectId | null;
  }[] = [
    {
      name: "Demo Developer",
      email: "dev@evigilance.local",
      nic: "199001000001",
      role: "dev",
      stationId: null,
    },
    {
      name: "Demo HQ Officer",
      email: "hq@evigilance.local",
      nic: "199001000002",
      role: "hq",
      stationId: null,
    },
    {
      name: "Demo OIC Kandy",
      email: "oic.kandy@evigilance.local",
      nic: "199001000003",
      role: "station_oic",
      stationId: kandy,
    },
    {
      name: "Demo Officer Kandy",
      email: "officer.kandy@evigilance.local",
      nic: "199001000004",
      role: "station_officer",
      stationId: kandy,
    },
    {
      name: "Demo OIC Galle",
      email: "oic.galle@evigilance.local",
      nic: "199001000005",
      role: "station_oic",
      stationId: galle,
    },
  ];

  let usersAdded = 0;
  for (const u of demo) {
    const res = await db.collection("users").updateOne(
      { staff: true, email: u.email },
      {
        $setOnInsert: {
          staff: true,
          ...u,
          phone: null,
          active: true,
          passwordHash: hash,
          mustChangePassword: false,
          failedLogins: 0,
          lockedUntil: null,
          lastLoginAt: null,
          mfa: {
            enabled: false,
            secretEnc: null,
            pendingSecretEnc: null,
            lastTimeStep: null,
            enabledAt: null,
          },
          createdBy: "seed",
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
    usersAdded += res.upsertedCount;
  }

  console.log(`Divisions added: ${divisionsAdded} (of ${DIVISIONS.length})`);
  console.log(`Stations added:  ${stationsAdded} (of ${osm.stations.length}, unverified)`);
  console.log(`Demo accounts added: ${usersAdded}`);
  for (const u of demo) console.log(`  ${u.role.padEnd(16)} ${u.email}`);
  console.log(
    "Password: the SEED_PASSWORD from .env. HQ and dev set up an authenticator app at first sign-in.",
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

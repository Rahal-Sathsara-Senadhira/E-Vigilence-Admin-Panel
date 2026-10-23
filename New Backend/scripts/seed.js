// Demo data for development: two divisions, three stations and one account
// per role (docs/20 §3). Safe to run again: existing records are kept, and
// existing passwords are only reset with --reset-passwords.
//
//   npm run seed
//   npm run seed -- --reset-passwords

import { loadEnv } from "#src/config/env.js";
import { hashPassword } from "#src/core/auth/passwords.js";
import { connectDatabase, disconnectDatabase } from "#src/core/db/connection.js";
import { Division, Station } from "#src/modules/organisation/organisation.model.js";
import { User } from "#src/modules/users/user.model.js";

const env = loadEnv();
if (env.NODE_ENV === "production") throw new Error("The demo seed never runs in production.");
if (!env.SEED_PASSWORD) throw new Error("Set SEED_PASSWORD in .env (12+ characters).");
const resetPasswords = process.argv.includes("--reset-passwords");

await connectDatabase({ uri: env.MONGODB_URI, dbName: env.MONGODB_DB_NAME });
await Promise.all([Division.syncIndexes(), Station.syncIndexes(), User.syncIndexes()]);

/** @param {{ code: string, name: string }} d */
const division = (d) =>
  Division.findOneAndUpdate(
    { code: d.code },
    { $setOnInsert: d },
    { upsert: true, returnDocument: "after" },
  );
/** Demo stations are marked as seed data, not as added by HQ. @param {{ code: string, name: string, divisionId: any }} s */
const station = (s) =>
  Station.findOneAndUpdate(
    { code: s.code },
    { $setOnInsert: { ...s, source: "seed" } },
    { upsert: true, returnDocument: "after" },
  );

const kandyDiv = await division({ code: "KDY", name: "Kandy Division" });
const colomboDiv = await division({ code: "CMB", name: "Colombo Central Division" });
const kandy = await station({
  code: "KDY-01",
  name: "Kandy Police Station",
  divisionId: kandyDiv._id,
});
await station({ code: "KDY-02", name: "Peradeniya Police Station", divisionId: kandyDiv._id });
await station({ code: "CMB-01", name: "Fort Police Station", divisionId: colomboDiv._id });

const ACCOUNTS = [
  { role: "system_admin", name: "Demo System Administrator", email: "sysadmin@evigilance.local" },
  {
    role: "hq_admin",
    name: "Demo HQ Administrator",
    email: "hq.admin@evigilance.local",
    serviceNumber: "HQ1001",
  },
  {
    role: "hq_operator",
    name: "Demo HQ Operator",
    email: "hq.operator@evigilance.local",
    serviceNumber: "HQ1002",
  },
  {
    role: "hq_supervisor",
    name: "Demo HQ Supervisor",
    email: "hq.supervisor@evigilance.local",
    serviceNumber: "HQ1003",
  },
  { role: "finance_officer", name: "Demo Finance Officer", email: "finance@evigilance.local" },
  { role: "auditor", name: "Demo Auditor", email: "auditor@evigilance.local" },
  {
    role: "executive",
    name: "Demo Executive Viewer",
    email: "executive@evigilance.local",
    serviceNumber: "HQ1004",
  },
  {
    role: "division_supervisor",
    name: "Demo Division Supervisor Kandy",
    email: "division.kandy@evigilance.local",
    serviceNumber: "KD2001",
    divisionId: kandyDiv._id,
  },
  {
    role: "station_oic",
    name: "Demo OIC Kandy",
    email: "oic.kandy@evigilance.local",
    serviceNumber: "KD3001",
    stationId: kandy._id,
  },
  {
    role: "traffic_officer",
    name: "Demo Officer Kandy",
    email: "officer.kandy@evigilance.local",
    serviceNumber: "KD3002",
    stationId: kandy._id,
  },
  {
    role: "station_clerk",
    name: "Demo Clerk Kandy",
    email: "clerk.kandy@evigilance.local",
    serviceNumber: "KD3003",
    stationId: kandy._id,
  },
];

const passwordHash = await hashPassword(env.SEED_PASSWORD);
for (const a of ACCOUNTS) {
  const existing = await User.findOne({ email: a.email });
  if (existing) {
    if (resetPasswords) {
      existing.passwordHash = passwordHash;
      existing.failedAttempts = 0;
      existing.lockedUntil = null;
      existing.authVersion += 1;
      await existing.save();
      console.log(`  reset   ${a.email}`);
    } else {
      console.log(`  kept    ${a.email}`);
    }
    continue;
  }
  await User.create({
    serviceNumber: null,
    stationId: null,
    divisionId: null,
    ...a,
    passwordHash,
    // Demo accounts skip the first-password step; real accounts never do.
    mustChangePassword: false,
  });
  console.log(`  created ${a.email}`);
}

console.log(`\nDone. Password for every demo account: the SEED_PASSWORD in .env.`);
await disconnectDatabase();

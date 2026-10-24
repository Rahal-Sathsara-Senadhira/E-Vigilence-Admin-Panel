// Demo reports for development — through the same rules as the screens.
//
//   npm run seed:reports
//
// Needs the demo accounts (npm run seed) and the reference data
// (npm run import-reference-data -- --apply). Never runs in production.

import { loadEnv } from "#src/config/env.js";
import { connectDatabase, disconnectDatabase } from "#src/core/db/connection.js";
import { askReporter, recordReport } from "#src/modules/reports/reports.service.js";
import { User } from "#src/modules/users/user.model.js";

const env = loadEnv();
if (env.NODE_ENV === "production") throw new Error("Demo reports never go into production.");
await connectDatabase({ uri: env.MONGODB_URI, dbName: env.MONGODB_DB_NAME });

/** @param {string} email */
async function actorOf(email) {
  const u = await User.findOne({ email }).lean();
  if (!u) throw new Error(`Run npm run seed first (${email} missing).`);
  return /** @type {any} */ ({
    userId: u._id,
    name: u.name,
    role: u.role,
    stationId: u.stationId,
    divisionId: u.divisionId,
  });
}
const ctx = { ip: null, userAgent: "seed-reports" };
const ago = (/** @type {number} */ hours) => new Date(Date.now() - hours * 3_600_000);

try {
  const hq = await actorOf("hq.operator@evigilance.local");
  const clerk = await actorOf("clerk.kandy@evigilance.local");
  const officer = await actorOf("officer.kandy@evigilance.local");

  const made = [];
  const base = {
    reporter: { kind: "named", name: "Saman Kumara", phone: "+94771234567" },
    plateUnknown: false,
    injuries: false,
  };
  made.push(
    await recordReport(
      hq,
      {
        ...base,
        channel: "whatsapp",
        occurredAt: ago(3),
        lat: 6.9271,
        lng: 79.8612,
        address: "Galle Road, Kollupitiya",
        vehicleNumber: "WP CAB-4521",
        vehicleType: "car",
        offenceCodes: ["MTA-152A"],
        description: "Driver talking on a mobile phone while driving towards Bambalapitiya.",
      },
      ctx,
    ),
  );
  made.push(
    await recordReport(
      hq,
      {
        ...base,
        channel: "whatsapp",
        occurredAt: ago(1),
        lat: 6.9022,
        lng: 79.8605,
        address: "Duplication Road, Colombo 4",
        vehicleNumber: "WP NB-7788",
        vehicleType: "bus",
        offenceCodes: ["MTA-217"],
        description: "Bus racing another bus and overtaking on a pedestrian crossing.",
        injuries: true,
      },
      ctx,
    ),
  );
  made.push(
    await recordReport(
      hq,
      {
        ...base,
        channel: "phone",
        reporter: { kind: "anonymous" },
        occurredAt: ago(6),
        address: "Kandy Road, Kadawatha",
        vehicleNumber: "WP QJ-3310",
        vehicleType: "three_wheeler",
        offenceCodes: ["MTA-164"],
        description: "Three-wheeler went through a red light at the Kadawatha junction.",
      },
      ctx,
    ),
  );
  const asked = await recordReport(
    hq,
    {
      ...base,
      channel: "whatsapp",
      occurredAt: ago(20),
      address: "Baseline Road, Borella",
      vehicleNumber: "WP KX-1022",
      vehicleType: "lorry",
      offenceCodes: ["MTA-188"],
      description: "Overloaded lorry with sand spilling onto the road near Borella.",
    },
    ctx,
  );
  await askReporter(
    hq,
    asked.id,
    "Which direction was the lorry going, and do you have a photo of the load?",
    ctx,
  );
  made.push(asked);
  made.push(
    await recordReport(
      clerk,
      {
        ...base,
        channel: "walk_in",
        reporter: { kind: "named", name: "Nimal Perera", phone: "+94712345678" },
        occurredAt: ago(4),
        lat: 7.2936,
        lng: 80.6413,
        address: "Dalada Veediya, Kandy",
        vehicleNumber: "CP CAR-4804",
        vehicleType: "car",
        offenceCodes: ["MTA-157A", "MTA-155"],
        description: "Driver without a seat belt sounding the horn continuously near the temple.",
      },
      ctx,
    ),
  );
  made.push(
    await recordReport(
      officer,
      {
        ...base,
        channel: "officer",
        reporter: { kind: "anonymous" },
        occurredAt: ago(2),
        address: "Peradeniya Road, Kandy",
        vehicleNumber: "CP BCD-2211",
        vehicleType: "motorcycle",
        offenceCodes: ["MTA-158"],
        description: "Rider and pillion without helmets, seen on patrol.",
      },
      ctx,
    ),
  );

  for (const r of made) console.log(`  ${r.reportNumber}  ${r.status}`);
  console.log("\nDone.");
} finally {
  await disconnectDatabase();
}

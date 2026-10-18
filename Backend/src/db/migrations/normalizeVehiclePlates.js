// One-off migration: rewrite existing Violation.vehicleNumber values to the
// canonical Sri Lankan plate spelling (utils/plate.js), so older records
// match new ones in search and duplicate detection. Values that don't parse
// as a Sri Lankan plate are left exactly as they are.
//
// Idempotent — safe to re-run. Prints what it would change first; pass
// --apply to write.
//
//   node src/db/migrations/normalizeVehiclePlates.js          (dry run)
//   node src/db/migrations/normalizeVehiclePlates.js --apply
import mongoose from "mongoose";
import { connectMongo } from "../providers/mongo/index.js";
import { normalizePlate } from "../../utils/plate.js";

async function migrate() {
  const apply = process.argv.includes("--apply");
  await connectMongo();

  const collection = mongoose.connection.db.collection("violations");
  const docs = await collection
    .find({ vehicleNumber: { $type: "string" } }, { projection: { vehicleNumber: 1 } })
    .toArray();

  let changed = 0;
  let unparsed = 0;

  for (const doc of docs) {
    const canonical = normalizePlate(doc.vehicleNumber);
    if (!canonical) {
      unparsed++;
      continue;
    }
    if (canonical === doc.vehicleNumber) continue;

    changed++;
    console.log(`${doc._id}: "${doc.vehicleNumber}" -> "${canonical}"`);
    if (apply) {
      await collection.updateOne({ _id: doc._id }, { $set: { vehicleNumber: canonical } });
    }
  }

  console.log(
    `\n${apply ? "Updated" : "Would update"} ${changed} of ${docs.length} plates ` +
      `(${unparsed} don't parse as Sri Lankan plates and were left as-is).`
  );
  if (!apply && changed > 0) console.log("Re-run with --apply to write these changes.");

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});

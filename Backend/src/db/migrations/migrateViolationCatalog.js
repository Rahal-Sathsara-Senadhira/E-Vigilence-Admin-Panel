// One-off migration: rewrite legacy `Violation.violations` (array of free-text
// strings) into ObjectId refs against ViolationCatalogEntry.
//
// Idempotent — a document whose violations[0] is already an ObjectId is
// skipped, so this is safe to re-run (e.g. after new legacy data appears).
//
// Run manually, same way as seedAdminUser.js:
//   node src/db/migrations/migrateViolationCatalog.js
import mongoose from "mongoose";
import { connectMongo } from "../providers/mongo/index.js";
import Violation from "../providers/mongo/models/Violation.js";
import { resolveCatalogEntries } from "../../utils/violationCatalog.js";

async function migrate() {
  await connectMongo();

  const db = mongoose.connection.db;
  const collection = db.collection("violations");

  const docs = await collection.find({}).toArray();

  let migrated = 0;
  let skipped = 0;

  for (const doc of docs) {
    const current = Array.isArray(doc.violations) ? doc.violations : [];

    const alreadyMigrated =
      current.length > 0 && current.every((v) => v instanceof mongoose.Types.ObjectId);

    if (alreadyMigrated) {
      skipped++;
      continue;
    }

    const names = current.length > 0 ? current : [doc.type || "Uncategorized"];
    const resolvedIds = await resolveCatalogEntries(names);

    await collection.updateOne(
      { _id: doc._id },
      { $set: { violations: resolvedIds } }
    );

    migrated++;
  }

  console.log(`Migration complete: ${migrated} migrated, ${skipped} already-migrated (skipped).`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

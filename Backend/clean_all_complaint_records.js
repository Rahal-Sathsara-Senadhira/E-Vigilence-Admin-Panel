import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

async function cleanAllComplaintRecords() {
  if (!process.env.MONGO_URI) {
    console.error("Error: MONGO_URI is missing in .env file.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.\n");

  const db = mongoose.connection.db;

  // Collections to wipe completely
  const collectionsToClear = [
    "violations",
    "reports",
    "violationcatalogentries",
    "dispatches",
    "citations",
    "citizenreportskips",
    "evidence.files",
    "evidence.chunks",
    "evidenceuploads",
    "reportruns",
    "notifications",
  ];

  console.log("--- Clearing Complaint-Related Collections ---");
  for (const colName of collectionsToClear) {
    try {
      const exists = (await db.listCollections({ name: colName }).toArray()).length > 0;
      if (exists) {
        const result = await db.collection(colName).deleteMany({});
        console.log(`✓ Cleared collection '${colName}': deleted ${result.deletedCount} documents.`);
      } else {
        console.log(`- Collection '${colName}' does not exist (skipped).`);
      }
    } catch (err) {
      console.error(`✗ Error clearing '${colName}':`, err.message);
    }
  }

  console.log("\n--- Master Data Retained Safely ---");
  const masterCollections = ["users", "policestations", "regionalstations", "settings"];
  for (const colName of masterCollections) {
    try {
      const count = await db.collection(colName).countDocuments();
      console.log(`✓ Kept '${colName}': ${count} documents intact.`);
    } catch (err) {
      // ignore
    }
  }

  console.log("\nCleanup completed successfully!");
  await mongoose.disconnect();
}

cleanAllComplaintRecords().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});

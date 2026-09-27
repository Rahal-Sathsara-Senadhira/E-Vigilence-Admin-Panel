import app from "./app.js";
import { env } from "./config/env.js";
import { connectMongo } from "./db/providers/mongo/index.js";
import { syncCitizenReports } from "./modules/violations/citizenReportSync.js";

const CITIZEN_SYNC_INTERVAL_MS = 60_000;

async function start() {
  try {
    console.log("⏳ Starting backend...");
    console.log("ENV PORT =", env.PORT);

    await connectMongo();

    app.listen(env.PORT, "0.0.0.0", () => {
      console.log(`✅ Backend running on http://localhost:${env.PORT}`);
    });

    // Pulls in new reports from the citizen app's shared `reports`
    // collection (see citizenReportSync.js). A manual trigger also exists at
    // POST /api/violations/sync-citizen-reports.
    setInterval(() => {
      syncCitizenReports().catch((err) =>
        console.error("⚠️  Citizen report sync failed:", err.message)
      );
    }, CITIZEN_SYNC_INTERVAL_MS);
  } catch (err) {
    console.error("❌ Backend failed to start:", err);
    process.exit(1);
  }
}

start();
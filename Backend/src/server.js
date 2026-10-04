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
    //
    // Atlas connectivity from this network is occasionally flaky (DNS/TLS
    // blips that self-heal on the next tick) — logging every single failed
    // attempt floods the console at one line/minute during an extended
    // outage. Log the first failure immediately, then only a reminder every
    // 5 attempts while it stays down, plus a one-line recovery notice.
    let consecutiveSyncFailures = 0;

    setInterval(() => {
      syncCitizenReports()
        .then(() => {
          if (consecutiveSyncFailures > 0) {
            console.log(
              `✅ Citizen report sync recovered after ${consecutiveSyncFailures} failed attempt(s)`
            );
          }
          consecutiveSyncFailures = 0;
        })
        .catch((err) => {
          consecutiveSyncFailures++;
          const isFirstFailure = consecutiveSyncFailures === 1;
          const isPeriodicReminder = consecutiveSyncFailures % 5 === 0;

          if (isFirstFailure || isPeriodicReminder) {
            console.error(
              `⚠️  Citizen report sync failed (${consecutiveSyncFailures} consecutive attempt${
                consecutiveSyncFailures === 1 ? "" : "s"
              }): ${err.message}`
            );
          }
        });
    }, CITIZEN_SYNC_INTERVAL_MS);
  } catch (err) {
    console.error("❌ Backend failed to start:", err);
    process.exit(1);
  }
}

start();
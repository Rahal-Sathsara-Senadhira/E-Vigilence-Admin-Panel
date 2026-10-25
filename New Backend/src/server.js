// Starts the backend: settings, database, HTTP server, background jobs,
// clean shutdown.

import { createApp, storageFrom } from "./app.js";
import { loadEnv } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./core/db/connection.js";
import { every } from "./core/jobs.js";
import { createLogger } from "./core/logger.js";
import { startAppImport } from "./modules/app-import/index.js";
import { runNoticeSweep, runSmsDispatch } from "./modules/notices/index.js";
import { runDemeritSweep } from "./modules/demerit/index.js";
import { importAccountDeletions, runMonthlyRetention } from "./modules/retention/index.js";
import { runScheduledReports } from "./modules/management-reports/management-reports.service.js";
import { runDeadlineSweep } from "./modules/notifications/index.js";
import { runPaymentSweep } from "./modules/payments/index.js";
import { rejectUnanswered } from "./modules/reports/index.js";
import {
  importPayoutRequests,
  payApprovedBatches,
  runRewardSweep,
} from "./modules/rewards/index.js";

const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL });

await connectDatabase({ uri: env.MONGODB_URI, dbName: env.MONGODB_DB_NAME });
logger.info({ db: env.MONGODB_DB_NAME }, "Database connected");

const storage = storageFrom(env);
const app = createApp({ env, logger, storage });
const server = app.listen(env.PORT, () =>
  logger.info(`E-Vigilance backend on http://localhost:${env.PORT}`),
);
const appImport = startAppImport({
  storage,
  env,
  logger,
  intervalSeconds: env.APP_IMPORT_INTERVAL_SECONDS,
});
// Reports whose reporter didn't answer in time (docs/02 §6.3).
const noResponse = every({
  name: "No-response sweep",
  seconds: 15 * 60,
  logger,
  work: async () => {
    const rejected = await rejectUnanswered();
    return rejected ? { rejected } : null;
  },
});
// Notices past their due date: reminders, then court proposals (docs/05 §6.4).
const noticeSweep = every({
  name: "Notice sweep",
  seconds: 15 * 60,
  logger,
  work: async () => {
    const r = await runNoticeSweep();
    return r.reminded || r.proposed ? r : null;
  },
});
// Bank delays confirmed after a minute; payments pending a day expire (docs/07).
const paymentSweep = every({
  name: "Payment sweep",
  seconds: 30,
  logger,
  work: async () => {
    const r = await runPaymentSweep();
    return r.confirmed || r.expired ? r : null;
  },
});

// Missed time limits, hearing reminders, stations without an OIC (docs/09).
const deadlineSweep = every({
  name: "Deadline sweep",
  seconds: 5 * 60,
  logger,
  work: async () => {
    const r = await runDeadlineSweep();
    return r.breached || r.escalated || r.resolved || r.reminded ? r : null;
  },
});
// Queued SMS to addressees, through the gateway (docs/09 §5.4).
const smsDispatch = every({
  name: "SMS dispatch",
  seconds: 30,
  logger,
  work: async () => {
    const r = await runSmsDispatch();
    return r.sent || r.failed ? r : null;
  },
});

// Unpaid reward points that lapse, and the warning before (docs/16 §6).
const rewardSweep = every({
  name: "Reward sweep",
  seconds: 60 * 60,
  logger,
  work: async () => {
    const r = await runRewardSweep();
    return r.expired || r.warned ? r : null;
  },
});
// Payout requests from the app, and approved batches not yet fully paid.
const payouts = every({
  name: "Payouts",
  seconds: 60,
  logger,
  work: async () => {
    const received = await importPayoutRequests();
    const r = await payApprovedBatches();
    return received || r.paid || r.failed ? { received, ...r } : null;
  },
});

// Scheduled management reports at 06:00 Sri Lanka time (docs/12 §7).
const scheduledReports = every({
  name: "Scheduled reports",
  seconds: 10 * 60,
  logger,
  work: async () => {
    const made = await runScheduledReports();
    return made ? { made } : null;
  },
});

// Demerit points expire 24 months after the offence (docs/08 D08-4).
const demeritSweep = every({
  name: "Demerit sweep",
  seconds: 24 * 60 * 60,
  logger,
  work: async () => {
    const changed = await runDemeritSweep();
    return changed ? { changed } : null;
  },
});

// Data retention, monthly once HQ has turned it on (docs/10 §6), and
// accounts deleted in the mobile app (§5.5).
const retention = every({
  name: "Data retention",
  seconds: 60 * 60,
  logger,
  work: async () => {
    const forgotten = await importAccountDeletions();
    const run = await runMonthlyRetention();
    return forgotten || run ? { forgotten, run: run?.results ?? null } : null;
  },
});

/** @param {string} signal */
async function shutdown(signal) {
  logger.info({ signal }, "Shutting down");
  server.close();
  const jobs = [appImport, noResponse, noticeSweep, paymentSweep, deadlineSweep, smsDispatch];
  await Promise.all(
    [...jobs, rewardSweep, payouts, scheduledReports, demeritSweep, retention].map((j) => j.stop()),
  );
  await disconnectDatabase();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

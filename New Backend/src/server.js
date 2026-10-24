// Starts the backend: settings, database, HTTP server, background jobs,
// clean shutdown.

import { createApp, storageFrom } from "./app.js";
import { loadEnv } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./core/db/connection.js";
import { every } from "./core/jobs.js";
import { createLogger } from "./core/logger.js";
import { startAppImport } from "./modules/app-import/index.js";
import { runNoticeSweep } from "./modules/notices/index.js";
import { runPaymentSweep } from "./modules/payments/index.js";
import { rejectUnanswered } from "./modules/reports/index.js";

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

/** @param {string} signal */
async function shutdown(signal) {
  logger.info({ signal }, "Shutting down");
  server.close();
  await Promise.all([appImport.stop(), noResponse.stop(), noticeSweep.stop(), paymentSweep.stop()]);
  await disconnectDatabase();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

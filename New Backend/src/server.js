// Starts the backend: settings, database, HTTP server, clean shutdown.

import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./core/db/connection.js";
import { createLogger } from "./core/logger.js";

const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL });

await connectDatabase({ uri: env.MONGODB_URI, dbName: env.MONGODB_DB_NAME });
logger.info({ db: env.MONGODB_DB_NAME }, "Database connected");

const app = createApp({ env, logger });
const server = app.listen(env.PORT, () =>
  logger.info(`E-Vigilance backend on http://localhost:${env.PORT}`),
);

/** @param {string} signal */
async function shutdown(signal) {
  logger.info({ signal }, "Shutting down");
  server.close();
  await disconnectDatabase();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

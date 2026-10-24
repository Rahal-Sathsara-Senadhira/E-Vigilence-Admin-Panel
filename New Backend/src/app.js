// Builds the Express app (docs/19 §4). No listening here, so tests can use
// the app directly.

import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import { assertEveryRouteGuarded, publicRoute } from "./core/access/guards.js";
import { allowOrigin } from "./core/http/cors.js";
import { requireCsrfHeader } from "./core/http/csrf.js";
import { errorHandler, notFoundHandler } from "./core/http/error-handler.js";
import { createStorage } from "./core/storage.js";
import { casesRoutes } from "./modules/cases/cases.routes.js";
import { evidenceRoutes } from "./modules/evidence/evidence.routes.js";
import { auditRoutes } from "./modules/audit/audit.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { createAuthService } from "./modules/auth/auth.service.js";
import { authenticate } from "./modules/auth/authenticate.js";
import { offencesRoutes } from "./modules/offences/offences.routes.js";
import { divisionsRoutes, stationsRoutes } from "./modules/organisation/organisation.routes.js";
import { personsRoutes, vehiclesRoutes } from "./modules/registers/registers.routes.js";
import { courtCasesRoutes, courtsRoutes } from "./modules/court/court.routes.js";
import { noticesRoutes, publicNoticesRoutes } from "./modules/notices/notices.routes.js";
import { notificationsRoutes, overdueRoutes } from "./modules/notifications/index.js";
import { paymentsRoutes, publicPaymentsRoutes } from "./modules/payments/payments.routes.js";
import { configurePayments } from "./modules/payments/payments.service.js";
import { reportersRoutes } from "./modules/reporters/reporters.routes.js";
import { rewardsRoutes } from "./modules/rewards/index.js";
import { reportsRoutes } from "./modules/reports/reports.routes.js";
import { settingsRoutes } from "./modules/settings/settings.routes.js";
import { usersRoutes } from "./modules/users/users.routes.js";

/**
 * @param {{ env: import("./config/env.js").Env, logger: import("./core/logger.js").Logger, storage?: import("./core/storage.js").Storage }} deps
 */
export function createApp({ env, logger, storage = storageFrom(env) }) {
  configurePayments(env);
  const app = express();
  const production = env.NODE_ENV === "production";

  // Behind the hosting platform's proxies in production (Railway: 1; with the
  // panel's host forwarding /api as well: 2), so req.ip is the client's address
  // — the rate limits depend on it.
  app.set("trust proxy", production ? env.TRUST_PROXY_HOPS : false);
  app.disable("x-powered-by");

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      autoLogging: env.NODE_ENV !== "test",
    }),
  );
  app.use(helmet());
  app.use("/api", allowOrigin(env.WEB_ORIGIN));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use("/api", requireCsrfHeader);

  const jwtSecret = env.JWT_SECRET;
  app.use("/api", authenticate({ jwtSecret }));

  const auth = createAuthService({ jwtSecret, mfaKey: env.MFA_ENCRYPTION_KEY });

  const api = express.Router();
  api.get("/health", publicRoute(), (_req, res) => {
    res.json({ status: "ok", database: mongoose.connection.readyState === 1 ? "up" : "down" });
  });
  api.use("/auth", authRoutes(auth, { secureCookies: production }));
  api.use("/users", usersRoutes());
  api.use("/divisions", divisionsRoutes());
  api.use("/stations", stationsRoutes());
  api.use("/audit", auditRoutes());
  api.use("/offences", offencesRoutes());
  api.use("/settings", settingsRoutes());
  api.use("/reports", reportsRoutes(storage));
  api.use("/evidence", evidenceRoutes(storage));
  api.use("/cases", casesRoutes(storage));
  api.use("/reporters", reportersRoutes());
  api.use("/persons", personsRoutes());
  api.use("/vehicles", vehiclesRoutes());
  api.use("/notices", noticesRoutes());
  api.use("/public/notices", publicNoticesRoutes());
  api.use("/payments", paymentsRoutes(storage));
  api.use("/court-cases", courtCasesRoutes());
  api.use("/courts", courtsRoutes());
  api.use("/notifications", notificationsRoutes());
  api.use("/overdue", overdueRoutes());
  api.use("/rewards", rewardsRoutes());
  api.use("/public/payments", publicPaymentsRoutes());
  app.use("/api/v1", api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  assertEveryRouteGuarded(app);
  return app;
}

/**
 * Evidence storage from the settings: R2 when configured (everything under
 * R2_PREFIX), otherwise a local folder.
 * @param {import("./config/env.js").Env} env
 */
export function storageFrom(env) {
  const r2Ready = Boolean(
    env.R2_ENDPOINT && env.R2_ACCESS_KEY && env.R2_SECRET_KEY && env.R2_BUCKET_NAME,
  );
  const driver = env.EVIDENCE_STORAGE ?? (r2Ready ? "r2" : "local");
  // Hosting disks are wiped on every deploy: evidence must live in R2.
  if (env.NODE_ENV === "production" && driver === "local")
    throw new Error(
      "In production, evidence needs R2: set R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY and R2_BUCKET_NAME.",
    );
  if (driver === "r2" && !r2Ready)
    throw new Error("EVIDENCE_STORAGE is r2 but the R2_* settings are incomplete.");
  return createStorage(
    driver === "r2"
      ? {
          driver,
          r2: {
            endpoint: /** @type {string} */ (env.R2_ENDPOINT),
            accessKey: /** @type {string} */ (env.R2_ACCESS_KEY),
            secretKey: /** @type {string} */ (env.R2_SECRET_KEY),
            bucket: /** @type {string} */ (env.R2_BUCKET_NAME),
            prefix: env.R2_PREFIX,
          },
        }
      : { driver, localDir: env.EVIDENCE_LOCAL_DIR },
  );
}

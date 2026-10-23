// Builds the Express app (docs/19 §4). No listening here, so tests can use
// the app directly.

import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import { assertEveryRouteGuarded, publicRoute } from "./core/access/guards.js";
import { requireCsrfHeader } from "./core/http/csrf.js";
import { errorHandler, notFoundHandler } from "./core/http/error-handler.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { createAuthService } from "./modules/auth/auth.service.js";
import { authenticate } from "./modules/auth/authenticate.js";

/**
 * @param {{ env: import("./config/env.js").Env, logger: import("./core/logger.js").Logger }} deps
 */
export function createApp({ env, logger }) {
  const app = express();
  const production = env.NODE_ENV === "production";

  // Behind one proxy (the hosting platform) in production, so req.ip is the client's address.
  app.set("trust proxy", production ? 1 : false);
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
  app.use("/api/v1", api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  assertEveryRouteGuarded(app);
  return app;
}

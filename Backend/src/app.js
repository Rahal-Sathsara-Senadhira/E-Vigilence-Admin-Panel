import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import { CORS_ORIGIN, NODE_ENV } from "./config/env.js";
import { HttpError } from "./utils/httpError.js";

import violationsRoutes from "./modules/violations/violations.routes.js";
import violationCatalogRoutes from "./modules/violationCatalog/violationCatalog.routes.js";
import citationsRoutes from "./modules/citations/citations.routes.js";
import evidenceRoutes from "./modules/evidence/evidence.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import reportsRoutes from "./modules/reports/reports.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";

import regionalStationsRoutes from "./modules/regionalStations/regionalStations.routes.js";
import stationsRoutes from "./modules/stations/stations.routes.js";
import policeStationsRoutes from "./modules/policeStations/policeStations.routes.js";

import notificationsRoutes from "./modules/notifications/notifications.routes.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import dispatchRoutes from "./modules/dispatch/dispatch.routes.js";

import authRoutes from "./modules/auth/auth.routes.js";

const app = express();

app.use(helmet());

// CORS_ORIGIN supports a single origin or a comma-separated list (matching
// the citizen app's own CORS_ORIGINS convention). In development, any
// http://localhost:<port> / http://127.0.0.1:<port> origin is also allowed
// — Vite auto-bumps to the next free port whenever the usual one is taken
// by a stale process, which otherwise breaks the whole app with a CORS
// error every time that happens and requires manually re-syncing this env
// var. Production still enforces the explicit allow-list.
const allowedOrigins = CORS_ORIGIN === "*" ? [] : CORS_ORIGIN.split(",").map((o) => o.trim());
const isLocalhostOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // same-origin / non-browser requests
      if (CORS_ORIGIN === "*") return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (NODE_ENV !== "production" && isLocalhostOrigin(origin)) return callback(null, true);
      callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Auth
app.use("/api/auth", authRoutes);

// Core APIs
app.use("/api/violations", violationsRoutes);
app.use("/api/violation-catalog", violationCatalogRoutes);
app.use("/api/citations", citationsRoutes);
app.use("/api/evidence", evidenceRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/dashboard", dashboardRoutes);

// ✅ HQ stations (protected module)
app.use("/api/stations", stationsRoutes);
app.use(dispatchRoutes);

// ✅ Regional stations (your RegionalStations page uses these)
app.use("/api/regional-stations", regionalStationsRoutes);
app.use("/api/regionalStations", regionalStationsRoutes);
app.use("/api/regionalstations", regionalStationsRoutes);

// ✅ Public police-stations endpoints (list/nearest etc.)
app.use("/api/police-stations", policeStationsRoutes);

// Other modules
app.use("/api/notifications", notificationsRoutes);
app.use("/api/settings", settingsRoutes);

// 404
app.use((req, _res, next) => {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
});

// error handler
app.use((err, _req, res, _next) => {
  const status = err.statusCode || 500;
  const message = status === 500 ? "Something went wrong" : err.message;
  if (status === 500) console.error(err);
  res.status(status).json({ message });
});

export default app;
import express from "express";
import cors from "cors";

import { CORS_ORIGIN } from "./config/env.js";
import { HttpError } from "./utils/httpError.js";

import violationsRoutes from "./modules/violations/violations.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import reportsRoutes from "./modules/reports/reports.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";

import regionalStationsRoutes from "./modules/regionalStations/regionalStations.routes.js";
import stationsRoutes from "./modules/stations/stations.routes.js";
import policeStationsRoutes from "./modules/policeStations/policeStations.routes.js";

import notificationsRoutes from "./modules/notifications/notifications.routes.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import dispatchRoutes from "./modules/dispatch/dispatch.routes.js";

const app = express();

app.use(cors({ origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Core APIs
app.use("/api/violations", violationsRoutes);
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
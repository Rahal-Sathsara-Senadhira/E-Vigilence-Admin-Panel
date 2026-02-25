import express from "express";
import cors from "cors";

import { CORS_ORIGIN } from "./config/env.js";
import { HttpError } from "./utils/httpError.js";

import violationsRoutes from "./modules/violations/violations.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import reportsRoutes from "./modules/reports/reports.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";
import stationsRoutes from "./modules/regionalStations/regionalStations.routes.js";
import notificationsRoutes from "./modules/notifications/notifications.routes.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import policeStationsRoutes from "./modules/policeStations/policeStations.routes.js";

const app = express();

app.use(cors({ origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/violations", violationsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/dashboard", dashboardRoutes);

// ✅ MAIN route
app.use("/api/stations", stationsRoutes);

// ✅ ALIASES (so frontend won’t break if it uses different paths)
app.use("/api/regionalStations", stationsRoutes);
app.use("/api/regional-stations", stationsRoutes);
app.use("/api/regionalstations", stationsRoutes);

app.use("/api/notifications", notificationsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/police-stations", policeStationsRoutes);
// 404
app.use((req, res, next) => {
  next(new HttpError(404, "Route not found"));
});

// error handler
app.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  const message = status === 500 ? "Something went wrong" : err.message;
  if (status === 500) console.error(err);
  res.status(status).json({ message });
});

export default app;

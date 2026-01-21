// Backend/src/app.js
import express from "express";
import cors from "cors";

// ---- Routes
import violationsRoutes from "./modules/violations/violations.routes.js";
import reportsRoutes from "./modules/reports/reports.routes.js";
import regionalStationsRoutes from "./modules/regionalStations/regionalStations.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import notificationsRoutes from "./modules/notifications/notifications.routes.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";

export function createApp() {
  const app = express();

  // ---- Middlewares
  app.use(express.json());

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || "*",
    }),
  );

  // ---- Health check
  app.get("/api/health", (req, res) => {
    res.json({ ok: true, message: "API is healthy ✅" });
  });

  // ---- API routes
  app.use("/api/violations", violationsRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use("/api/regional-stations", regionalStationsRoutes);
  app.use("/api/users", usersRoutes);

  // ✅ Notifications (this removes your 404)
  app.use("/api/notifications", notificationsRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/dashboard", dashboardRoutes);

  // ---- 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  // ---- Error handler
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(400).json({ error: err.message || "Something went wrong" });
  });

  return app;
}

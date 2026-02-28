import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.js";
import {
  dispatchNearest,
  inbox,
  assignedMe,
  stationUpdate,
  byViolation,
} from "./dispatch.controller.js";

const router = Router();

// POST /api/violations/:id/dispatch-nearest (HQ/admin only)
router.post(
  "/api/violations/:id/dispatch-nearest",
  requireAuth,
  requireRole("hq", "admin"), // ✅ allow admin too
  dispatchNearest
);

// GET /api/dispatches/by-violation/:id (HQ/admin only)
router.get(
  "/api/dispatches/by-violation/:id",
  requireAuth,
  requireRole("hq", "admin"), // ✅ allow admin too
  byViolation
);

// GET /api/dispatches/inbox (HQ/admin sees all, station sees theirs)
router.get("/api/dispatches/inbox", requireAuth, inbox);

// GET /api/violations/assigned/me (station only)
router.get("/api/violations/assigned/me", requireAuth, assignedMe);

// PATCH /api/violations/:id/station-update (station only)
router.patch("/api/violations/:id/station-update", requireAuth, stationUpdate);

export default router;
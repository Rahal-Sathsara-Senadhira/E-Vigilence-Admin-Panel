import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.js";
import {
  dispatchNearest,
  dispatchManual,
  inbox,
  assignedMe,
  stationUpdate,
  byViolation,
  receive,
  returnToHq,
} from "./dispatch.controller.js";

const router = Router();

// POST /api/violations/:id/dispatch-nearest (HQ only)
router.post(
  "/api/violations/:id/dispatch-nearest",
  requireAuth,
  requireRole("hq"),
  dispatchNearest
);

// POST /api/violations/:id/dispatch-to/:stationId (HQ only — manual override)
router.post(
  "/api/violations/:id/dispatch-to/:stationId",
  requireAuth,
  requireRole("hq"),
  dispatchManual
);

// GET /api/dispatches/by-violation/:id (HQ only)
router.get(
  "/api/dispatches/by-violation/:id",
  requireAuth,
  requireRole("hq"),
  byViolation
);

// GET /api/dispatches/inbox (HQ sees all, station sees theirs)
router.get("/api/dispatches/inbox", requireAuth, inbox);

// GET /api/violations/assigned/me (station only)
router.get("/api/violations/assigned/me", requireAuth, assignedMe);

// PATCH /api/violations/:id/station-update (station only)
router.patch("/api/violations/:id/station-update", requireAuth, stationUpdate);

// POST /api/violations/:id/receive (station only) — accept a dispatched case
router.post("/api/violations/:id/receive", requireAuth, receive);

// POST /api/violations/:id/return (station only) — misrouted: back to HQ
router.post("/api/violations/:id/return", requireAuth, returnToHq);

export default router;
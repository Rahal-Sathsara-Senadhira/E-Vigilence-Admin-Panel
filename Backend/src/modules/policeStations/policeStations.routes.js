import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.js";
import * as c from "./policeStations.controller.js";

const router = Router();

// Station list/lookup is used by the logged-in admin panel only (Users,
// New Complaint, Violation Details) — never anonymously.
router.use(requireAuth);

// "/nearest" must be registered before "/:stationId", otherwise Express
// matches it as a station id.
router.get("/", c.list);                              // List all stations
router.get("/nearest", c.nearest);                    // Find nearest stations
router.get("/:stationId", c.getById);                 // Get station details
router.get("/:stationId/violations", c.getViolationsByStation);  // Get violations + evidence for station (HQ or own station)

export default router;

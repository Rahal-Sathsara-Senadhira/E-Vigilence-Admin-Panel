import { Router } from "express";
import * as c from "./policeStations.controller.js";

const router = Router();

router.get("/", c.list);                              // List all stations
router.get("/:stationId", c.getById);                 // Get station details
router.get("/:stationId/violations", c.getViolationsByStation);  // Get violations + evidence for station
router.get("/nearest", c.nearest);                    // Find nearest stations

export default router;
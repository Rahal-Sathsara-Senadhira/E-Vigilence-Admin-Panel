import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.js";
import * as c from "./policeStations.controller.js";

// The one police-stations API (replaces the old duplicate /api/stations).
// Reads: any staff user — station users only see their own station's
// profile, officers and history (enforced in stations.service.js). Writes:
// HQ, except that a station admin may edit their own station's contact
// details via PATCH.
const router = Router();
const STAFF = ["hq", "station_admin", "station_officer"];

router.use(requireAuth, requireRole(...STAFF));

// Fixed paths before "/:stationId", which would otherwise match them.
router.get("/", c.list);
router.get("/nearest", c.nearest);
router.get("/verification-queue", requireRole("hq"), c.verificationQueue);
router.post("/", requireRole("hq"), c.create);
router.post("/import", requireRole("hq"), c.importCsv);

router.get("/:stationId", c.getById);
router.get("/:stationId/officers", c.officers);
router.get("/:stationId/audit", c.audit);
router.patch("/:stationId", requireRole("hq", "station_admin"), c.update);
router.post("/:stationId/verify", requireRole("hq"), c.verify);
router.put("/:stationId/jurisdiction", requireRole("hq"), c.setJurisdiction);
router.get("/:stationId/deactivation-plan", requireRole("hq"), c.deactivationPlan);
router.post("/:stationId/deactivate", requireRole("hq"), c.deactivate);
router.post("/:stationId/reactivate", requireRole("hq"), c.reactivate);
router.delete("/:stationId", requireRole("hq"), c.remove);

export default router;

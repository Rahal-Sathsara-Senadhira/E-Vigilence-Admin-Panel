import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.js";
import * as ctrl from "./reports.controller.js";

const router = Router();

// HQ only — reports and CSV exports are system-wide (not station-scoped), and
// saved report runs are shared across callers. Matches the frontend, where
// the Reports page is HQ-only.
router.use(requireAuth, requireRole("hq"));

router.get("/violations/summary", ctrl.violationsSummary);
router.get("/violations/export", ctrl.violationsExportCsv);

// Saved report runs (history / reopen)
router.post("/violations/run", ctrl.createViolationsReportRun);
router.get("/violations/runs", ctrl.listViolationsReportRuns);
router.get("/violations/runs/:id", ctrl.getViolationsReportRun);
router.get("/violations/runs/:id/export", ctrl.exportViolationsReportRunCsv);

export default router;

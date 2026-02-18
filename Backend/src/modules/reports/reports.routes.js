import { Router } from "express";
import * as ctrl from "./reports.controller.js";

const router = Router();

router.get("/violations/summary", ctrl.violationsSummary);
router.get("/violations/export", ctrl.violationsExportCsv);

// Saved report runs (history / reopen)
router.post("/violations/run", ctrl.createViolationsReportRun);
router.get("/violations/runs", ctrl.listViolationsReportRuns);
router.get("/violations/runs/:id", ctrl.getViolationsReportRun);
router.get("/violations/runs/:id/export", ctrl.exportViolationsReportRunCsv);

export default router;

import { Router } from "express";
import { violationsSummaryHandler, violationsCsvHandler } from "./reports.controller.js";

const router = Router();

// Summary (JSON)
router.get("/violations/summary", violationsSummaryHandler);

// CSV export
router.get("/violations/export", violationsCsvHandler);

export default router;

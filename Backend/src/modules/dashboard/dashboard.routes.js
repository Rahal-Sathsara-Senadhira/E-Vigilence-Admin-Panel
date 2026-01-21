import { Router } from "express";
import { dashboardSummaryHandler } from "./dashboard.controller.js";

const router = Router();

router.get("/summary", dashboardSummaryHandler);

export default router;

import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.js";
import * as controller from "./dashboard.controller.js";

const router = Router();

// /api/dashboard?days=14
router.get("/", requireAuth, controller.getDashboard);

export default router;
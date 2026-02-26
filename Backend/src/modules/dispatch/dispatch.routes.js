import { Router } from "express";
import { dispatchNearest } from "./dispatch.controller.js";

const router = Router();

// POST /api/violations/:id/dispatch-nearest
router.post("/api/violations/:id/dispatch-nearest", dispatchNearest);

export default router;
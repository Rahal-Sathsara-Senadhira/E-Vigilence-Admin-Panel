import { Router } from "express";
import { login, me } from "./auth.controller.js";
import { requireAuth } from "../../middlewares/auth.js";

const router = Router();

// POST /api/auth/login
router.post("/login", login);

// GET /api/auth/me
router.get("/me", requireAuth, me);

export default router;
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { login, logout, me } from "./auth.controller.js";
import { requireAuth } from "../../middlewares/auth.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again later." },
});

// POST /api/auth/login
router.post("/login", loginLimiter, login);

// POST /api/auth/logout
router.post("/logout", logout);

// GET /api/auth/me
router.get("/me", requireAuth, me);

export default router;
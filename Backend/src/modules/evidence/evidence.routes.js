import { Router } from "express";
import * as ctrl from "./evidence.controller.js";

const router = Router();

// No requireAuth on either route — see evidence.controller.js for why (same
// public-URL trust model as Cloudinary, which these are a fallback for).
router.get("/r2/:encodedKey", ctrl.serveR2Evidence);
router.get("/:id", ctrl.serveEvidence);

export default router;

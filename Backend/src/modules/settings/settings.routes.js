import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.js";
import * as c from "./settings.controller.js";

const router = Router();

router.use(requireAuth);

// What the Settings page actually loads/saves
router.get("/", c.getMine);
router.patch("/profile", c.patchProfile);
router.patch("/password", c.patchPassword);
router.patch("/preferences", c.patchPreferences);
router.patch("/system", requireRole("hq", "admin"), c.patchSystem);

// Generic key/value store (kept for any other consumer)
router.get("/:key", c.getByKey);
router.put("/:key", c.upsert);

export default router;

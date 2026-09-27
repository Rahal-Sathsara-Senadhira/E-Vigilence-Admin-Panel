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
router.patch("/system", requireRole("hq"), c.patchSystem);

// Generic key/value store (kept for any other consumer) — HQ only, since
// this is an unscoped escape hatch that can read/write any key (including
// "system", which patchSystem above deliberately restricts to HQ).
router.get("/:key", requireRole("hq"), c.getByKey);
router.put("/:key", requireRole("hq"), c.upsert);

export default router;

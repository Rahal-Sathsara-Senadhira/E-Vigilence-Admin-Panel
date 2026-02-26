import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.js";
import * as ctrl from "./stations.controller.js";

const router = Router();

// HQ only CRUD
router.get("/", requireAuth, requireRole("hq"), ctrl.list);
router.get("/:id", requireAuth, requireRole("hq"), ctrl.getOne);
router.post("/", requireAuth, requireRole("hq"), ctrl.create);
router.patch("/:id", requireAuth, requireRole("hq"), ctrl.update);
router.delete("/:id", requireAuth, requireRole("hq"), ctrl.remove);

export default router;
import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.js";
import * as ctrl from "./violationCatalog.controller.js";

const router = Router();

router.use(requireAuth);

// Reads: any authenticated role — station officers pick from this list too
// when creating/editing a violation.
router.get("/", ctrl.list);
router.get("/:id", ctrl.getOne);

// Writes: HQ only — this is the controlled vocabulary, not something a
// station account should be able to redefine.
router.post("/", requireRole("hq"), ctrl.create);
router.patch("/:id", requireRole("hq"), ctrl.update);
router.delete("/:id", requireRole("hq"), ctrl.remove);

export default router;

import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.js";
import * as ctrl from "./citations.controller.js";

const router = Router();

router.use(requireAuth);

// Reads: HQ sees all citations; a station account is scoped to citations
// tied to violations assigned to their own station (see citations.controller.js#list).
router.get("/", ctrl.list);
router.get("/:id", ctrl.getOne);

// Writes: HQ only — manual payment-status tracking, no payment gateway exists.
router.patch("/:id", requireRole("hq"), ctrl.updatePaymentStatus);

export default router;

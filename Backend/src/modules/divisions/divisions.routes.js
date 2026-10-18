import { Router } from "express";
import asyncHandler from "../../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../../middlewares/auth.js";
import * as svc from "./divisions.service.js";

// Territorial police divisions (the regional offices). HQ only for now —
// a division_admin role is planned for later.
const router = Router();
router.use(requireAuth, requireRole("hq"));

router.get("/", asyncHandler(async (_req, res) => res.json(await svc.listDivisions())));
router.get("/:id", asyncHandler(async (req, res) => res.json(await svc.getDivision(req.params.id))));
router.post("/", asyncHandler(async (req, res) => res.status(201).json(await svc.createDivision(req.body))));
router.patch("/:id", asyncHandler(async (req, res) => res.json(await svc.updateDivision(req.params.id, req.body))));

export default router;

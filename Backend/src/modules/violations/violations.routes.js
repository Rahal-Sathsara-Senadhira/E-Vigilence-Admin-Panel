import { Router } from "express";
import {
  createViolationHandler,
  listViolationsHandler,
  getViolationHandler,
  updateViolationHandler,
  deleteViolationHandler,
} from "./violations.controller.js";

const router = Router();

router.get("/", listViolationsHandler);
router.post("/", createViolationHandler);
router.get("/:id", getViolationHandler);
router.patch("/:id", updateViolationHandler);
router.delete("/:id", deleteViolationHandler);

export default router;

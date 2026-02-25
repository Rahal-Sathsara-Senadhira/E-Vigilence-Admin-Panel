import { Router } from "express";
import * as c from "./policeStations.controller.js";

const router = Router();

router.get("/", c.list);                 // optional
router.get("/nearest", c.nearest);       // ✅ replaces frontend calc

export default router;
import { Router } from "express";
import * as c from "./reports.controller.js";

const router = Router();

router.get("/summary", c.summary);

export default router;

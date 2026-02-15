import { Router } from "express";
import * as c from "./dashboard.controller.js";

const router = Router();

router.get("/", c.get);

export default router;

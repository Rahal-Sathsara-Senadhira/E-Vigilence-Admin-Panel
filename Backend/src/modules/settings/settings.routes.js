import { Router } from "express";
import * as c from "./settings.controller.js";

const router = Router();

router.get("/", c.list);
router.get("/:key", c.getByKey);
router.put("/:key", c.upsert);

export default router;

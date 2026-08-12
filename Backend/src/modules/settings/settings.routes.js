import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.js";
import * as c from "./settings.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", c.list);
router.get("/:key", c.getByKey);
router.put("/:key", c.upsert);

export default router;

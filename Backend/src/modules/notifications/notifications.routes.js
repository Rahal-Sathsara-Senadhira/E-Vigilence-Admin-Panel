import { Router } from "express";
import * as c from "./notifications.controller.js";

const router = Router();

router.get("/", c.list);
router.post("/", c.create);
router.patch("/:id/read", c.markRead);
router.delete("/:id", c.remove);

export default router;

import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.js";
import * as c from "./notifications.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/unread-count", c.unreadCount);
router.get("/", c.list);
router.post("/", c.create);
router.patch("/:id/read", c.markRead);
router.delete("/:id", c.remove);

export default router;

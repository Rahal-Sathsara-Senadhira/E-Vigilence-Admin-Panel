import { Router } from "express";
import {
  listNotificationsHandler,
  createNotificationHandler,
  markAsReadHandler,
} from "./notifications.controller.js";

const router = Router();

router.get("/", listNotificationsHandler);
router.post("/", createNotificationHandler);
router.patch("/:id/read", markAsReadHandler);

export default router;

import { Router } from "express";
import {
  createUserHandler,
  listUsersHandler,
  updateUserHandler,
} from "./users.controller.js";

const router = Router();

router.get("/", listUsersHandler);
router.post("/", createUserHandler);
router.patch("/:id", updateUserHandler);

export default router;

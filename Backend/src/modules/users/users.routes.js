import { Router } from "express";
import * as controller from "./users.controller.js";

const router = Router();

router.get("/", controller.listUsers);
router.post("/", controller.createUser);
router.get("/:id", controller.getUserById);
router.patch("/:id", controller.updateUser);
router.delete("/:id", controller.deleteUser);

export default router;
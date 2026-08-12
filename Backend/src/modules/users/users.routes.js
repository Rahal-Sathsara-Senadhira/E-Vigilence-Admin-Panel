import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.js";
import * as controller from "./users.controller.js";

const router = Router();

router.use(requireAuth, requireRole("hq", "admin"));

router.get("/", controller.listUsers);
router.post("/", controller.createUser);
router.get("/:id", controller.getUserById);
router.patch("/:id", controller.updateUser);
router.delete("/:id", controller.deleteUser);

export default router;
import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.js";
import * as controller from "./users.controller.js";

const router = Router();

// hq manages any user; station_admin manages only their own station's
// officers (scoping enforced in users.service.js, per caller passed through
// from users.controller.js).
router.use(requireAuth, requireRole("hq", "station_admin"));

router.get("/", controller.listUsers);
router.post("/", controller.createUser);
router.get("/:id", controller.getUserById);
router.patch("/:id", controller.updateUser);
router.delete("/:id", controller.deleteUser);

export default router;
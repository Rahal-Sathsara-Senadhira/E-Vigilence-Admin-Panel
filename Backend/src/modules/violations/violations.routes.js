import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.js";
import * as c from "./violations.controller.js";
import { handleFileUpload } from "../../middlewares/fileUpload.js";

const router = Router();

router.use(requireAuth);

router.get("/", c.list);
router.get("/:id", c.getById);
router.post("/", requireRole("hq", "admin"), c.create);
router.post("/upload-evidence", requireRole("hq", "admin"), handleFileUpload, c.uploadEvidence);
router.patch("/:id", requireRole("hq", "admin"), c.update);
router.delete("/:id", requireRole("hq", "admin"), c.remove);

export default router;

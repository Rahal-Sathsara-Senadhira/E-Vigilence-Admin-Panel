import { Router } from "express";
import * as c from "./violations.controller.js";
import { handleFileUpload } from "../../middlewares/fileUpload.js";

const router = Router();

router.get("/", c.list);
router.get("/:id", c.getById);
router.post("/", c.create);
router.post("/upload-evidence", handleFileUpload, c.uploadEvidence);
router.delete("/:id", c.remove);

export default router;

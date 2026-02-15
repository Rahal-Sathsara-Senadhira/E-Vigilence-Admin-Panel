import { Router } from "express";
import * as c from "./violations.controller.js";

const router = Router();

router.get("/", c.list);
router.get("/:id", c.getById);
router.post("/", c.create);
router.delete("/:id", c.remove);

export default router;

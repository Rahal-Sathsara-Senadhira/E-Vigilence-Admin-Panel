import { Router } from "express";
import * as c from "./regionalStations.controller.js";
import { requireAuth, requireRole } from "../../middlewares/auth.js";

const router = Router();

router.use(requireAuth);

// ✅ BULK SEED / UPSERT
router.post("/bulk", requireRole("hq"), c.bulkUpsert);

// ✅ LIST routes (some frontends use /all)
router.get("/", c.list);
router.get("/all", c.list);

// ✅ GET BY ID
router.get("/:id", c.getById);

// ✅ CREATE routes (some frontends use /add or /create)
router.post("/", requireRole("hq"), c.create);
router.post("/add", requireRole("hq"), c.create);
router.post("/create", requireRole("hq"), c.create);

// ✅ UPDATE
router.patch("/:id", requireRole("hq"), c.update);

// ✅ DELETE
router.delete("/:id", requireRole("hq"), c.remove);

export default router;
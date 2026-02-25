import { Router } from "express";
import * as c from "./regionalStations.controller.js";

const router = Router();

// ✅ BULK SEED / UPSERT
router.post("/bulk", c.bulkUpsert);

// ✅ LIST routes (some frontends use /all)
router.get("/", c.list);
router.get("/all", c.list);

// ✅ GET BY ID
router.get("/:id", c.getById);

// ✅ CREATE routes (some frontends use /add or /create)
router.post("/", c.create);
router.post("/add", c.create);
router.post("/create", c.create);

// ✅ UPDATE
router.patch("/:id", c.update);

// ✅ DELETE
router.delete("/:id", c.remove);

export default router;
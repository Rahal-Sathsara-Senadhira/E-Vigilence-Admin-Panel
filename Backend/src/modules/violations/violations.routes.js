import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.js";
import { requireIngestKey } from "../../middlewares/ingestAuth.js";
import * as c from "./violations.controller.js";
import { handleFileUpload } from "../../middlewares/fileUpload.js";

const router = Router();

// Machine-to-machine ingestion from the separate citizen-reporting backend —
// authenticated via a shared service key, not a user session, so it's
// mounted before router.use(requireAuth) below.
router.post("/ingest", requireIngestKey, c.create);

router.use(requireAuth);

router.get("/", c.list);
router.post("/sync-citizen-reports", requireRole("hq"), c.syncCitizenReportsNow);
router.get("/:id", c.getById);
router.post("/", requireRole("hq"), c.create);
router.post("/upload-evidence", requireRole("hq"), handleFileUpload, c.uploadEvidence);
router.patch("/:id", requireRole("hq"), c.update);
router.delete("/:id", requireRole("hq"), c.remove);

export default router;

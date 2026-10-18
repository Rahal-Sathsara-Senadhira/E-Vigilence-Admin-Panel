import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { requireAuth, requireRole } from "../../middlewares/auth.js";
import { requireIngestKey } from "../../middlewares/ingestAuth.js";
import * as c from "./violations.controller.js";
import { handleEvidenceUpload } from "../../middlewares/fileUpload.js";

const router = Router();

// Who can file complaints: HQ, and station staff (walk-ins at their own
// station — the complaint is assigned to that station).
const STAFF = ["hq", "station_admin", "station_officer"];

// Per signed-in user (falls back to IP) — generous for real use, but stops a
// runaway client or script from flooding complaints or uploads.
const perUser = (limit) =>
  rateLimit({
    windowMs: 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user?.id ? `u:${req.user.id}` : ipKeyGenerator(req.ip)),
    message: { message: "Too many requests — please wait a moment and try again." },
  });

// Machine-to-machine ingestion from the separate citizen-reporting backend —
// authenticated via a shared service key, not a user session, so it's
// mounted before router.use(requireAuth) below.
router.post("/ingest", requireIngestKey, c.create);

router.use(requireAuth);

router.get("/", c.list);
router.get("/stats", c.stats); // before "/:id", which would otherwise match it
router.post("/sync-citizen-reports", requireRole("hq"), c.syncCitizenReportsNow);
router.post("/check-duplicates", requireRole(...STAFF), perUser(60), c.checkDuplicates);
router.post("/evidence", requireRole(...STAFF), perUser(30), handleEvidenceUpload, c.uploadEvidenceFile);
router.get("/evidence/:uploadId", requireRole(...STAFF), c.getEvidenceFile);
router.delete("/evidence/:uploadId", requireRole(...STAFF), c.discardEvidenceFile);
router.get("/:id", c.getById);
router.post("/", requireRole(...STAFF), perUser(10), c.createComplaint);
router.patch("/:id", requireRole("hq"), c.update);
router.delete("/:id", requireRole("hq"), c.remove);

export default router;

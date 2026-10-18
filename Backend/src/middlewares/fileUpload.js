import multer from "multer";
import os from "os";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { HttpError } from "../utils/httpError.js";

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Avatars: small images, kept in memory (settings.controller.js reads
// req.file.buffer). Capped at 5 MB — the old shared cap was 100 MB.
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  fileFilter(req, file, cb) {
    if (IMAGE_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, `Invalid file type. Allowed: ${IMAGE_MIMES.join(", ")}`));
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

// Evidence: one file per request, written to a temp file on disk rather
// than held in memory (a 100 MB video × several files used to sit in RAM).
// The real type and the per-kind size cap are checked afterwards from the
// bytes themselves (modules/evidence/evidenceUploads.js), so the browser's
// claimed type isn't trusted here.
const EVIDENCE_TMP_DIR = path.join(os.tmpdir(), "evigilance-evidence");
fs.mkdirSync(EVIDENCE_TMP_DIR, { recursive: true });

export const handleEvidenceUpload = multer({
  storage: multer.diskStorage({
    destination: EVIDENCE_TMP_DIR,
    filename: (_req, _file, cb) => cb(null, crypto.randomUUID()),
  }),
  limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 5 },
}).single("file");

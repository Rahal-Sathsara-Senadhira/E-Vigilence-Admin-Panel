import { uploadMultipleToCloudinary } from "./cloudinaryUpload.js";
import { uploadBufferToGridFS } from "./gridfsStorage.js";
import { uploadBufferToR2 } from "./r2Upload.js";
import { isR2Configured } from "../config/r2.js";

// Auto-select storage, in priority order: R2 (once real credentials are
// set — the project's decided long-term choice), then Cloudinary, then
// GridFS as the always-available fallback (same STORAGE_DRIVER=auto
// behavior the citizen app's backend already uses). Nothing needs to
// change in the controller when credentials are added or swapped later.
function cloudinaryConfigured() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  return Boolean(
    CLOUDINARY_CLOUD_NAME &&
      CLOUDINARY_API_KEY &&
      CLOUDINARY_API_SECRET &&
      !CLOUDINARY_CLOUD_NAME.startsWith("your_")
  );
}

// R2 and GridFS files are both proxied through this same backend rather
// than served from a public bucket URL / directly, so both need the
// request's own origin to build an absolute URL the frontend can use.
function absoluteBase(req) {
  return req ? `${req.protocol}://${req.get("host")}` : "";
}

export async function uploadMultipleEvidenceFiles(files, folder = "evidence", req = null) {
  if (isR2Configured()) {
    const base = absoluteBase(req);
    const urls = [];
    for (const file of files) {
      const key = await uploadBufferToR2(file.buffer, file.originalname, file.mimetype, folder);
      const encodedKey = Buffer.from(key, "utf8").toString("base64url");
      urls.push(`${base}/api/evidence/r2/${encodedKey}`);
    }
    return urls;
  }

  if (cloudinaryConfigured()) {
    return uploadMultipleToCloudinary(files, folder);
  }

  const base = absoluteBase(req);
  const urls = [];
  for (const file of files) {
    const id = await uploadBufferToGridFS(file.buffer, file.originalname, file.mimetype, folder);
    urls.push(`${base}/api/evidence/${id}`);
  }
  return urls;
}

export function activeEvidenceStorage() {
  if (isR2Configured()) return "r2";
  if (cloudinaryConfigured()) return "cloudinary";
  return "gridfs";
}

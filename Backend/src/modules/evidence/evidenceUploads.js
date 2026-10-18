import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import EvidenceUpload from "../../db/providers/mongo/models/EvidenceUpload.js";
import { HttpError } from "../../utils/httpError.js";
import { sniffFileMime } from "../../utils/fileSniff.js";
import { activeEvidenceStorage } from "../../utils/evidenceStorage.js";
import { uploadFileToR2, deleteFromR2 } from "../../utils/r2Upload.js";
import { uploadFileToGridFS, deleteFromGridFS } from "../../utils/gridfsStorage.js";
import { uploadFileToCloudinary, deleteFromCloudinary } from "../../utils/cloudinaryUpload.js";

// Staged evidence uploads for the New Complaint page:
//   1. storeEvidenceFile — a file arrives (already on disk via multer), is
//      checked, hashed, stored, and recorded as an unclaimed EvidenceUpload.
//   2. claimEvidenceUploads — creating the complaint takes its uploads.
//   3. cleanupUnclaimedUploads — uploads nobody claimed within a day are
//      deleted from storage (run periodically from server.js).

// What each kind accepts, judged by the file's real (sniffed) type, and the
// size cap for each — previously declared in fileUpload.js but never applied.
export const EVIDENCE_RULES = {
  images: {
    mimes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    maxBytes: 10 * 1024 * 1024,
  },
  videos: {
    mimes: ["video/mp4", "video/quicktime", "video/mpeg", "video/x-msvideo"],
    maxBytes: 100 * 1024 * 1024,
  },
  audios: {
    mimes: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/aac", "audio/mp4"],
    maxBytes: 50 * 1024 * 1024,
  },
};

const UNCLAIMED_TTL_MS = 24 * 60 * 60 * 1000;

function sha256OfFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(filePath)
      .on("error", reject)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")));
  });
}

function absoluteBase(req) {
  return `${req.protocol}://${req.get("host")}`;
}

async function putInStorage(file, mimeType, kind, req) {
  const folder = `evidence/${kind}`;
  const driver = activeEvidenceStorage();

  if (driver === "r2") {
    const key = await uploadFileToR2(file.path, file.size, file.originalname, mimeType, folder);
    const encoded = Buffer.from(key, "utf8").toString("base64url");
    return { url: `${absoluteBase(req)}/api/evidence/r2/${encoded}`, storage: { driver, key } };
  }

  if (driver === "cloudinary") {
    const r = await uploadFileToCloudinary(file.path, folder);
    return { url: r.url, storage: { driver, key: r.publicId, resourceType: r.resourceType } };
  }

  const id = await uploadFileToGridFS(file.path, file.originalname, mimeType, folder);
  return { url: `${absoluteBase(req)}/api/evidence/${id}`, storage: { driver, key: id } };
}

// `file` is a multer disk-storage file; the temp file is always removed.
export async function storeEvidenceFile(file, kind, req, clientLastModified = null) {
  try {
    const rule = EVIDENCE_RULES[kind];
    if (!rule) throw new HttpError(400, `Unknown evidence kind: ${kind}`);

    if (file.size > rule.maxBytes) {
      throw new HttpError(
        400,
        `${file.originalname} is too large — ${kind} can be at most ${rule.maxBytes / 1024 / 1024} MB`
      );
    }

    const mimeType = await sniffFileMime(file.path);
    if (!mimeType || !rule.mimes.includes(mimeType)) {
      throw new HttpError(400, `${file.originalname} is not a supported ${kind.slice(0, -1)} file`);
    }

    const sha256 = await sha256OfFile(file.path);
    const { url, storage } = await putInStorage(file, mimeType, kind, req);

    const lastModified = clientLastModified ? new Date(Number(clientLastModified)) : null;

    const doc = await EvidenceUpload.create({
      kind,
      url,
      storage,
      sha256,
      size: file.size,
      mimeType,
      originalName: file.originalname,
      clientLastModified: lastModified && !Number.isNaN(lastModified.getTime()) ? lastModified : null,
      uploadedBy: String(req.user.id),
    });

    return {
      id: String(doc._id),
      kind,
      url,
      sha256,
      size: doc.size,
      mimeType,
      originalName: doc.originalName,
    };
  } finally {
    await fsp.unlink(file.path).catch(() => {});
  }
}

// Atomically takes the caller's own unclaimed uploads for a new complaint.
// All-or-nothing: if any id is missing, someone else's, or already used,
// nothing is claimed. Returns a release() for when creating the complaint
// fails, and finalize(violationId) for when it succeeds.
export async function claimEvidenceUploads(ids, userId) {
  const unique = [...new Set((Array.isArray(ids) ? ids : []).map(String))];
  const empty = {
    files: { images: [], videos: [], audios: [] },
    evidenceFiles: [],
    release: async () => {},
    finalize: async () => {},
  };
  if (unique.length === 0) return empty;

  if (unique.some((id) => !/^[a-f0-9]{24}$/i.test(id))) {
    throw new HttpError(400, "evidenceIds must be upload ids");
  }

  const token = crypto.randomUUID();
  const filter = { _id: { $in: unique }, uploadedBy: String(userId), claimedAt: null };
  const r = await EvidenceUpload.updateMany(filter, { $set: { claimedAt: new Date(), claimToken: token } });

  const release = () =>
    EvidenceUpload.updateMany({ claimToken: token, claimedFor: null }, { $set: { claimedAt: null, claimToken: null } });

  if (r.modifiedCount !== unique.length) {
    await release();
    throw new HttpError(400, "Some evidence files are missing, already used, or were uploaded by someone else");
  }

  const docs = await EvidenceUpload.find({ claimToken: token }).lean();
  const files = { images: [], videos: [], audios: [] };
  for (const d of docs) files[d.kind].push(d.url);

  return {
    files,
    evidenceFiles: docs.map((d) => ({
      url: d.url,
      kind: d.kind,
      sha256: d.sha256,
      size: d.size,
      mimeType: d.mimeType,
      originalName: d.originalName,
      clientLastModified: d.clientLastModified,
      uploadedBy: d.uploadedBy,
      uploadedAt: d.createdAt,
    })),
    release,
    finalize: (violationId) =>
      EvidenceUpload.updateMany({ claimToken: token }, { $set: { claimedFor: violationId } }),
  };
}

// Lets the uploader discard a file they removed from the form before
// submitting, instead of waiting for the cleanup job.
export async function discardEvidenceUpload(id, userId) {
  const doc = await EvidenceUpload.findOne({ _id: id, uploadedBy: String(userId), claimedAt: null }).lean();
  if (!doc) throw new HttpError(404, "Upload not found");
  await deleteStoredObject(doc);
  await EvidenceUpload.deleteOne({ _id: doc._id });
}

async function deleteStoredObject(doc) {
  const { driver, key, resourceType } = doc.storage || {};
  if (driver === "r2") return deleteFromR2(key);
  if (driver === "cloudinary") return deleteFromCloudinary(key, resourceType || "image");
  if (driver === "gridfs") return deleteFromGridFS(key);
  return null;
}

// Deletes uploads nobody claimed within a day — files from abandoned forms.
// Failures are logged and retried on the next run.
export async function cleanupUnclaimedUploads() {
  const stale = await EvidenceUpload.find({
    claimedAt: null,
    createdAt: { $lt: new Date(Date.now() - UNCLAIMED_TTL_MS) },
  })
    .limit(200)
    .lean();

  let deleted = 0;
  for (const doc of stale) {
    try {
      await deleteStoredObject(doc);
      await EvidenceUpload.deleteOne({ _id: doc._id, claimedAt: null });
      deleted++;
    } catch (err) {
      console.error(`⚠️  Failed to delete unclaimed evidence ${doc._id}:`, err.message);
    }
  }
  return deleted;
}

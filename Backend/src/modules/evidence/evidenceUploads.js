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
import { ffmpegPath, compressVideo, compressAudio } from "../../utils/mediaCompress.js";
import { EVIDENCE_TMP_DIR } from "../../middlewares/fileUpload.js";

// Staged evidence uploads for the New Complaint page:
//   1. storeEvidenceFile — a file arrives (already on disk via multer) and is
//      checked and hashed. Photos and small audio are stored straight away;
//      videos and large audio are compressed in the background first
//      (status "processing" → "ready"), so phone recordings stay small.
//   2. claimEvidenceUploads — creating the complaint takes its uploads
//      (all must be "ready").
//   3. cleanupUnclaimedUploads — uploads nobody claimed within a day are
//      deleted from storage (run periodically from server.js).

// What each kind accepts (judged by the file's real, sniffed type) and the
// largest file accepted *before* compression. Generous on purpose: these
// are incident recordings straight off a phone.
export const EVIDENCE_RULES = {
  images: {
    mimes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    maxBytes: 25 * 1024 * 1024,
  },
  videos: {
    mimes: ["video/mp4", "video/quicktime", "video/mpeg", "video/x-msvideo"],
    maxBytes: 500 * 1024 * 1024,
  },
  audios: {
    mimes: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/aac", "audio/mp4"],
    maxBytes: 100 * 1024 * 1024,
  },
};

// Audio smaller than this is already compact (a typical voice note).
const AUDIO_COMPRESS_OVER = 5 * 1024 * 1024;
const UNCLAIMED_TTL_MS = 24 * 60 * 60 * 1000;
// A "processing" upload this old was interrupted (e.g. a server restart).
const STUCK_PROCESSING_MS = 2 * 60 * 60 * 1000;
// ffmpeg is CPU-heavy — only this many compressions run at once.
const MAX_CONCURRENT_JOBS = 2;

function sha256OfFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(filePath)
      .on("error", reject)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")));
  });
}

async function putInStorage({ path, size, name, mimeType, kind, base }) {
  const folder = `evidence/${kind}`;
  const driver = activeEvidenceStorage();

  if (driver === "r2") {
    const key = await uploadFileToR2(path, size, name, mimeType, folder);
    const encoded = Buffer.from(key, "utf8").toString("base64url");
    return { url: `${base}/api/evidence/r2/${encoded}`, storage: { driver, key } };
  }

  if (driver === "cloudinary") {
    const r = await uploadFileToCloudinary(path, folder);
    return { url: r.url, storage: { driver, key: r.publicId, resourceType: r.resourceType } };
  }

  const id = await uploadFileToGridFS(path, name, mimeType, folder);
  return { url: `${base}/api/evidence/${id}`, storage: { driver, key: id } };
}

const removeFile = (p) => (p ? fsp.unlink(p).catch(() => {}) : Promise.resolve());

function toClient(doc) {
  return {
    id: String(doc._id),
    kind: doc.kind,
    status: doc.status,
    progress: doc.progress,
    error: doc.error,
    url: doc.url,
    sha256: doc.sha256,
    size: doc.size,
    mimeType: doc.mimeType,
    originalName: doc.originalName,
    originalSize: doc.original?.size ?? null,
    compressed: !!doc.compressed,
  };
}

// --- background compression queue -----------------------------------------

const queue = [];
let running = 0;

function enqueue(job) {
  queue.push(job);
  pump();
}

function pump() {
  while (running < MAX_CONCURRENT_JOBS && queue.length > 0) {
    const job = queue.shift();
    running++;
    job()
      .catch((err) => console.error("⚠️  Evidence processing failed:", err.message))
      .finally(() => {
        running--;
        pump();
      });
  }
}

// Compresses, stores and finalizes one upload. Never loses the evidence: if
// compression fails or doesn't make the file smaller, the original is stored.
async function processUpload({ id, kind, inputPath, originalSize, originalMime, name, base }) {
  const outputPath = `${inputPath}.out.${kind === "videos" ? "mp4" : "m4a"}`;
  let lastSaved = 0;

  try {
    let useCompressed = false;
    try {
      const compress = kind === "videos" ? compressVideo : compressAudio;
      await compress(inputPath, outputPath, (p) => {
        // Throttle progress writes to the database.
        if (p - lastSaved >= 0.05) {
          lastSaved = p;
          EvidenceUpload.updateOne({ _id: id }, { $set: { progress: Math.min(p, 0.99) } }).catch(() => {});
        }
      });
      const { size } = await fsp.stat(outputPath);
      useCompressed = size > 0 && size < originalSize;
    } catch (err) {
      console.warn(`⚠️  Compression failed for evidence ${id}, storing the original: ${err.message}`);
    }

    const path = useCompressed ? outputPath : inputPath;
    const mimeType = useCompressed ? (kind === "videos" ? "video/mp4" : "audio/mp4") : originalMime;
    const storedName = useCompressed ? name.replace(/\.[^.]+$/, "") + (kind === "videos" ? ".mp4" : ".m4a") : name;
    const { size } = await fsp.stat(path);
    const sha256 = useCompressed ? await sha256OfFile(path) : undefined;

    const { url, storage } = await putInStorage({ path, size, name: storedName, mimeType, kind, base });

    const doc = await EvidenceUpload.findById(id).select("original").lean();
    await EvidenceUpload.updateOne(
      { _id: id },
      {
        $set: {
          status: "ready",
          progress: 1,
          url,
          storage,
          size,
          mimeType,
          sha256: sha256 ?? doc?.original?.sha256,
          compressed: useCompressed,
        },
      }
    );

    // Discarded while processing — the record is gone, so drop the file too.
    const still = await EvidenceUpload.exists({ _id: id });
    if (!still) await deleteStoredObject({ storage }).catch(() => {});
  } catch (err) {
    await EvidenceUpload.updateOne(
      { _id: id },
      { $set: { status: "failed", error: "Couldn't store this file — please try again" } }
    ).catch(() => {});
    throw err;
  } finally {
    await removeFile(inputPath);
    await removeFile(outputPath);
  }
}

// --- public API ---------------------------------------------------------------

// `file` is a multer disk-storage file. Returns the upload record; for videos
// (and large audio) it's still "processing" — poll getEvidenceUpload().
export async function storeEvidenceFile(file, kind, req, clientLastModified = null) {
  let handedOff = false;
  try {
    const rule = EVIDENCE_RULES[kind];
    if (!rule) throw new HttpError(400, `Unknown evidence kind: ${kind}`);

    if (file.size > rule.maxBytes) {
      throw new HttpError(
        400,
        `${file.originalname} is too large — ${kind.slice(0, -1)} files can be up to ${rule.maxBytes / 1024 / 1024} MB`
      );
    }

    const mimeType = await sniffFileMime(file.path);
    if (!mimeType || !rule.mimes.includes(mimeType)) {
      throw new HttpError(400, `${file.originalname} is not a supported ${kind.slice(0, -1)} file`);
    }

    const originalSha256 = await sha256OfFile(file.path);
    const lastModified = clientLastModified ? new Date(Number(clientLastModified)) : null;
    const base = `${req.protocol}://${req.get("host")}`;

    const common = {
      kind,
      original: { sha256: originalSha256, size: file.size, mimeType },
      originalName: file.originalname,
      clientLastModified: lastModified && !Number.isNaN(lastModified.getTime()) ? lastModified : null,
      uploadedBy: String(req.user.id),
    };

    const shouldCompress =
      !!ffmpegPath() && (kind === "videos" || (kind === "audios" && file.size > AUDIO_COMPRESS_OVER));

    if (!shouldCompress) {
      const { url, storage } = await putInStorage({
        path: file.path,
        size: file.size,
        name: file.originalname,
        mimeType,
        kind,
        base,
      });
      const doc = await EvidenceUpload.create({
        ...common,
        status: "ready",
        progress: 1,
        url,
        storage,
        sha256: originalSha256,
        size: file.size,
        mimeType,
        compressed: false,
      });
      return toClient(doc.toObject());
    }

    const doc = await EvidenceUpload.create({ ...common, status: "processing", progress: 0 });
    handedOff = true; // the job owns the temp file from here on
    enqueue(() =>
      processUpload({
        id: doc._id,
        kind,
        inputPath: file.path,
        originalSize: file.size,
        originalMime: mimeType,
        name: file.originalname,
        base,
      })
    );
    return toClient(doc.toObject());
  } finally {
    if (!handedOff) await removeFile(file.path);
  }
}

// The uploader's own upload — used by the page to poll compression progress.
export async function getEvidenceUpload(id, userId) {
  if (!/^[a-f0-9]{24}$/i.test(String(id))) throw new HttpError(404, "Upload not found");
  const doc = await EvidenceUpload.findOne({ _id: id, uploadedBy: String(userId) }).lean();
  if (!doc) throw new HttpError(404, "Upload not found");
  return toClient(doc);
}

// Atomically takes the caller's own unclaimed, ready uploads for a new
// complaint. All-or-nothing: if any id is missing, someone else's, still
// compressing, or already used, nothing is claimed. Returns release() for
// when creating the complaint fails, and finalize(violationId) on success.
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

  const processing = await EvidenceUpload.countDocuments({ _id: { $in: unique }, status: "processing" });
  if (processing > 0) {
    throw new HttpError(409, "Some evidence is still being compressed — try again in a moment");
  }

  const token = crypto.randomUUID();
  const filter = { _id: { $in: unique }, uploadedBy: String(userId), claimedAt: null, status: "ready" };
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
      originalSha256: d.original?.sha256,
      originalSize: d.original?.size,
      originalMimeType: d.original?.mimeType,
      compressed: !!d.compressed,
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
// submitting, instead of waiting for the cleanup job. A file still being
// compressed is dropped by its job once it finishes (see processUpload).
export async function discardEvidenceUpload(id, userId) {
  const doc = await EvidenceUpload.findOne({ _id: id, uploadedBy: String(userId), claimedAt: null }).lean();
  if (!doc) throw new HttpError(404, "Upload not found");
  if (doc.storage?.key) await deleteStoredObject(doc);
  await EvidenceUpload.deleteOne({ _id: doc._id });
}

async function deleteStoredObject(doc) {
  const { driver, key, resourceType } = doc.storage || {};
  if (!key) return null;
  if (driver === "r2") return deleteFromR2(key);
  if (driver === "cloudinary") return deleteFromCloudinary(key, resourceType || "image");
  if (driver === "gridfs") return deleteFromGridFS(key);
  return null;
}

// Deletes uploads nobody claimed within a day (abandoned forms), and marks
// uploads stuck in "processing" — e.g. interrupted by a restart — as failed
// so they're cleaned up too. Failures are logged and retried next run.
export async function cleanupUnclaimedUploads() {
  await EvidenceUpload.updateMany(
    { status: "processing", createdAt: { $lt: new Date(Date.now() - STUCK_PROCESSING_MS) } },
    { $set: { status: "failed", error: "Processing was interrupted — please upload again" } }
  );

  const stale = await EvidenceUpload.find({
    claimedAt: null,
    status: { $ne: "processing" },
    createdAt: { $lt: new Date(Date.now() - UNCLAIMED_TTL_MS) },
  })
    .limit(200)
    .lean();

  // Temp files left behind by a crash or restart mid-upload/compression.
  const tmpCutoff = Date.now() - UNCLAIMED_TTL_MS;
  for (const name of await fsp.readdir(EVIDENCE_TMP_DIR).catch(() => [])) {
    const p = `${EVIDENCE_TMP_DIR}/${name}`;
    const st = await fsp.stat(p).catch(() => null);
    if (st && st.mtimeMs < tmpCutoff) await removeFile(p);
  }

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

import mongoose from "mongoose";
import { Readable } from "stream";

// Fallback evidence storage — mirrors the citizen app's own STORAGE_DRIVER
// (its .env documents "gridfs = store media in MongoDB GridFS ... works
// with no extra accounts"). Used here when Cloudinary isn't configured
// (see utils/evidenceStorage.js), so evidence upload works out of the box
// against the same shared MongoDB this app already connects to.
const BUCKET_NAME = "evidence";
let bucket = null;

function getBucket() {
  if (!bucket) {
    bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET_NAME });
  }
  return bucket;
}

export function uploadBufferToGridFS(fileBuffer, fileName, mimeType, folder = "evidence") {
  return new Promise((resolve, reject) => {
    // The driver's top-level `contentType` upload option is deprecated and
    // no longer persisted to the files document — store it in `metadata`
    // instead (confirmed by inspecting a written document directly; the
    // top-level option silently no-ops otherwise).
    const uploadStream = getBucket().openUploadStream(fileName, {
      metadata: { folder, contentType: mimeType },
    });
    uploadStream.on("error", reject);
    uploadStream.on("finish", () => resolve(String(uploadStream.id)));
    Readable.from(fileBuffer).pipe(uploadStream);
  });
}

export async function getGridFSFileInfo(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const files = await getBucket().find({ _id: new mongoose.Types.ObjectId(id) }).toArray();
  return files[0] || null;
}

// `options` forwards { start, end } byte offsets for HTTP Range support
// (video/audio playback seeking).
export function openGridFSDownloadStream(id, options) {
  return getBucket().openDownloadStream(new mongoose.Types.ObjectId(id), options);
}

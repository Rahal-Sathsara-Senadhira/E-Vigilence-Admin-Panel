import mongoose from "mongoose";

// An evidence file uploaded from the New Complaint page before the complaint
// exists. It stays "unclaimed" until a complaint is created with its id;
// unclaimed uploads older than a day are deleted from storage by the cleanup
// job (modules/evidence/evidenceUploads.js), so an abandoned form doesn't
// leave files behind forever.
const EvidenceUploadSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["images", "videos", "audios"], required: true },

    // Videos (and large audio) are compressed in the background after the
    // upload request returns: "processing" until stored, then "ready".
    // "failed" only if even the uncompressed original couldn't be stored.
    status: { type: String, enum: ["processing", "ready", "failed"], default: "ready" },
    progress: { type: Number, default: 1 }, // 0–1 while compressing
    error: { type: String, default: null },

    // Set once stored (absent while processing).
    url: { type: String, default: null },

    // Where the bytes live, so the cleanup job can delete them.
    storage: {
      driver: { type: String, enum: ["r2", "cloudinary", "gridfs"] },
      key: { type: String }, // R2 key / Cloudinary public_id / GridFS id
      resourceType: { type: String, default: null }, // Cloudinary only
    },

    // Integrity: hash and size of the stored file, its type detected from
    // the bytes themselves, and the file's own modified time as the browser
    // reported it (not a verified capture time).
    sha256: { type: String, default: null },
    size: { type: Number, default: null },
    mimeType: { type: String, default: null },

    // The file exactly as uploaded — its hash is taken before any
    // compression, so the original can still be matched against a copy the
    // reporter kept. `compressed` is false when the stored file *is* the
    // original (images, small audio, or when compression didn't help).
    original: {
      sha256: { type: String, required: true },
      size: { type: Number, required: true },
      mimeType: { type: String, required: true },
    },
    compressed: { type: Boolean, default: false },
    originalName: { type: String, default: null },
    clientLastModified: { type: Date, default: null },

    uploadedBy: { type: String, required: true },

    // Set atomically when a create request takes the upload (claimToken
    // identifies that request), then claimedFor once the complaint exists.
    claimedFor: { type: mongoose.Schema.Types.ObjectId, ref: "Violation", default: null },
    claimedAt: { type: Date, default: null },
    claimToken: { type: String, default: null },
  },
  { timestamps: true }
);

EvidenceUploadSchema.index({ claimedAt: 1, createdAt: 1 });

const EvidenceUpload =
  mongoose.models.EvidenceUpload || mongoose.model("EvidenceUpload", EvidenceUploadSchema);
export default EvidenceUpload;

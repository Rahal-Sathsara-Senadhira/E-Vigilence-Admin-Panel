import mongoose from "mongoose";

// An evidence file uploaded from the New Complaint page before the complaint
// exists. It stays "unclaimed" until a complaint is created with its id;
// unclaimed uploads older than a day are deleted from storage by the cleanup
// job (modules/evidence/evidenceUploads.js), so an abandoned form doesn't
// leave files behind forever.
const EvidenceUploadSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["images", "videos", "audios"], required: true },
    url: { type: String, required: true },

    // Where the bytes live, so the cleanup job can delete them.
    storage: {
      driver: { type: String, enum: ["r2", "cloudinary", "gridfs"], required: true },
      key: { type: String, required: true }, // R2 key / Cloudinary public_id / GridFS id
      resourceType: { type: String, default: null }, // Cloudinary only
    },

    // Integrity: hash of the exact bytes received, the type detected from the
    // bytes themselves, and the file's own modified time as the browser
    // reported it (not a verified capture time).
    sha256: { type: String, required: true },
    size: { type: Number, required: true },
    mimeType: { type: String, required: true },
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

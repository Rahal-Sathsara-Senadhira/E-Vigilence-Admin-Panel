import multer from "multer";
import { HttpError } from "../utils/httpError.js";

// Store files in memory before uploading to R2
const storage = multer.memoryStorage();

// File filter to allow specific types
const fileFilter = (req, file, cb) => {
  const allowedMimes = {
    images: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    avatar: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    videos: ["video/mp4", "video/mpeg", "video/quicktime", "video/x-msvideo"],
    audios: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/aac"],
  };

  const fieldName = file.fieldname; // Should be 'images', 'videos', or 'audios'
  const allowed = allowedMimes[fieldName] || [];

  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new HttpError(
        400,
        `Invalid file type for ${fieldName}. Allowed: ${allowed.join(", ")}`
      )
    );
  }
};

// File size limits
const limits = {
  images: 10 * 1024 * 1024, // 10MB per image
  videos: 500 * 1024 * 1024, // 500MB per video
  audios: 50 * 1024 * 1024, // 50MB per audio
  fileSize: 500 * 1024 * 1024, // 500MB total
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits,
});

/**
 * Middleware to handle multipart form data with files
 * Accepts: images[], videos[], audios[]
 */
export const handleFileUpload = uploadMiddleware.fields([
  { name: "images", maxCount: 10 },
  { name: "videos", maxCount: 5 },
  { name: "audios", maxCount: 10 },
]);

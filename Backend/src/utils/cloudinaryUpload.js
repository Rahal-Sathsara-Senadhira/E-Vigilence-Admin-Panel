import { cloudinary } from "../config/cloudinary.js";
import { Readable } from "stream";

/**
 * Upload a file to Cloudinary
 * @param {Buffer} fileBuffer - File buffer to upload
 * @param {string} fileName - Original file name
 * @param {string} mimeType - MIME type of the file
 * @param {string} folder - Optional folder path (e.g., 'violations/images')
 * @returns {Promise<string>} - Public URL of the uploaded file
 */
export async function uploadToCloudinary(
  fileBuffer,
  fileName,
  mimeType,
  folder = "evidence"
) {
  try {
    // Create a readable stream from buffer
    const stream = Readable.from(fileBuffer);

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.v2.uploader.upload_stream(
        {
          folder: folder,
          resource_type: "auto", // Auto-detect file type (image, video, etc.)
          public_id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      stream.pipe(uploadStream);
    });

    // Return secure URL
    return result.secure_url;
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    throw new Error(
      `Failed to upload file to Cloudinary: ${error.message}`
    );
  }
}

/**
 * Delete a file from Cloudinary
 * @param {string} publicId - Public ID of the file to delete (can be extracted from URL)
 * @returns {Promise<boolean>} - True if successful
 */
export async function deleteFromCloudinary(publicId) {
  try {
    await cloudinary.v2.uploader.destroy(publicId);
    return true;
  } catch (error) {
    console.error("Cloudinary Delete Error:", error);
    throw new Error(
      `Failed to delete file from Cloudinary: ${error.message}`
    );
  }
}

/**
 * Upload multiple files to Cloudinary
 * @param {Array<{buffer: Buffer, originalname: string, mimetype: string}>} files - Array of file objects
 * @param {string} folder - Folder path in Cloudinary
 * @returns {Promise<string[]>} - Array of public URLs
 */
export async function uploadMultipleToCloudinary(files, folder = "evidence") {
  const urls = [];

  for (const file of files) {
    try {
      const url = await uploadToCloudinary(
        file.buffer,
        file.originalname,
        file.mimetype,
        folder
      );
      urls.push(url);
    } catch (error) {
      console.error(`Failed to upload ${file.originalname}:`, error);
      throw error;
    }
  }

  return urls;
}

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../config/r2.js";
import r2Config from "../config/r2.js";
import crypto from "crypto";

/**
 * Upload a file to Cloudflare R2
 * @param {Buffer} fileBuffer - File buffer to upload
 * @param {string} fileName - Original file name
 * @param {string} mimeType - MIME type of the file
 * @param {string} folder - Optional folder path (e.g., 'violations/images')
 * @returns {Promise<string>} - Public URL of the uploaded file
 */
export async function uploadToR2(fileBuffer, fileName, mimeType, folder = "evidence") {
  try {
    // Generate unique file name to avoid conflicts
    const timestamp = Date.now();
    const hash = crypto.randomBytes(8).toString("hex");
    const ext = fileName.split(".").pop();
    const uniqueFileName = `${timestamp}-${hash}.${ext}`;

    // Construct full key path
    const key = `${folder}/${uniqueFileName}`;

    // Upload to R2
    const command = new PutObjectCommand({
      Bucket: r2Config.bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
      CacheControl: "public, max-age=31536000", // Cache for 1 year
    });

    await s3Client.send(command);

    // Return public URL
    const publicUrl = `${r2Config.publicUrl}/${key}`;
    return publicUrl;
  } catch (error) {
    console.error("R2 Upload Error:", error);
    throw new Error(`Failed to upload file to R2: ${error.message}`);
  }
}

/**
 * Delete a file from Cloudflare R2
 * @param {string} fileUrl - Public URL of the file to delete
 * @returns {Promise<boolean>} - True if successful
 */
export async function deleteFromR2(fileUrl) {
  try {
    // Extract key from URL
    const urlParts = fileUrl.split(`${r2Config.publicUrl}/`);
    if (urlParts.length < 2) {
      throw new Error("Invalid file URL");
    }

    const key = urlParts[1];

    // Delete from R2
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const command = new DeleteObjectCommand({
      Bucket: r2Config.bucketName,
      Key: key,
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error("R2 Delete Error:", error);
    throw new Error(`Failed to delete file from R2: ${error.message}`);
  }
}

/**
 * Upload multiple files to R2
 * @param {Array<{buffer: Buffer, originalname: string, mimetype: string}>} files - Array of file objects
 * @param {string} folder - Folder path in R2
 * @returns {Promise<string[]>} - Array of public URLs
 */
export async function uploadMultipleToR2(files, folder = "evidence") {
  try {
    const uploadPromises = files.map((file) =>
      uploadToR2(file.buffer, file.originalname, file.mimetype, folder)
    );

    const urls = await Promise.all(uploadPromises);
    return urls;
  } catch (error) {
    console.error("R2 Multiple Upload Error:", error);
    throw new Error(`Failed to upload multiple files to R2: ${error.message}`);
  }
}

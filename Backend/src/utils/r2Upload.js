import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../config/r2.js";
import r2Config from "../config/r2.js";
import crypto from "crypto";

// Upload a file to Cloudflare R2. Returns the object's key (not a public
// URL) — the bucket stays private and files are proxied back through this
// backend (see modules/evidence/evidence.controller.js#serveR2Evidence)
// rather than served from R2 directly.
export async function uploadBufferToR2(fileBuffer, fileName, mimeType, folder = "evidence") {
  const timestamp = Date.now();
  const hash = crypto.randomBytes(8).toString("hex");
  const ext = fileName.includes(".") ? fileName.split(".").pop() : "bin";
  const key = `${folder}/${timestamp}-${hash}.${ext}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: r2Config.bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
    })
  );

  return key;
}

// `range` (optional) is the raw HTTP Range header value, forwarded as-is —
// S3's GetObjectCommand understands it natively and returns ContentRange/
// ContentLength/status metadata to match, no manual byte-slicing needed.
export async function getR2Object(key, range) {
  const command = new GetObjectCommand({
    Bucket: r2Config.bucketName,
    Key: key,
    ...(range ? { Range: range } : {}),
  });

  return s3Client.send(command);
}

export async function deleteFromR2(key) {
  await s3Client.send(new DeleteObjectCommand({ Bucket: r2Config.bucketName, Key: key }));
  return true;
}

import { S3Client } from "@aws-sdk/client-s3";

// R2_ENDPOINT (the full S3 API endpoint Cloudflare's dashboard shows
// alongside the access/secret key pair) takes priority; R2_ACCOUNT_ID is a
// fallback for constructing the same URL if only the bare account id is
// available.
const r2Config = {
  endpoint: process.env.R2_ENDPOINT || (process.env.R2_ACCOUNT_ID
    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : null),
  accessKeyId: process.env.R2_ACCESS_KEY,
  secretAccessKey: process.env.R2_SECRET_KEY,
  bucketName: process.env.R2_BUCKET_NAME,
  // Optional — only needed if serving files directly from a public bucket
  // URL instead of proxying through this backend (see modules/evidence/).
  publicUrl: process.env.R2_PUBLIC_URL,
};

export function isR2Configured() {
  return Boolean(
    r2Config.endpoint && r2Config.accessKeyId && r2Config.secretAccessKey && r2Config.bucketName
  );
}

// Initialize S3 client for R2 (R2 is S3-compatible) — only when actually
// configured, so importing this module never throws in a GridFS-only setup.
export const s3Client = isR2Configured()
  ? new S3Client({
      region: "auto",
      endpoint: r2Config.endpoint,
      credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
      },
    })
  : null;

export default r2Config;

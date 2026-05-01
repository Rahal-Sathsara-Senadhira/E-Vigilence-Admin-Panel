import { S3Client } from "@aws-sdk/client-s3";

const r2Config = {
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY,
  secretAccessKey: process.env.R2_SECRET_KEY,
  bucketName: process.env.R2_BUCKET_NAME,
  publicUrl: process.env.R2_PUBLIC_URL,
};

// Initialize S3 client for R2 (R2 is S3-compatible)
export const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: r2Config.accessKeyId,
    secretAccessKey: r2Config.secretAccessKey,
  },
});

export default r2Config;

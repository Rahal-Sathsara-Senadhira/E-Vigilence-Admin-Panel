// Environment settings, validated once at start-up. The API refuses to start
// with a missing or weak secret rather than running insecurely.

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4100),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  WEB_ORIGIN: z
    .string()
    .default("http://localhost:5280")
    .transform((v) =>
      v
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  MFA_ENCRYPTION_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, "base64").length === 32,
      "MFA_ENCRYPTION_KEY must be 32 bytes, base64",
    ),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  SESSION_HOURS: z.coerce.number().positive().max(24).default(12),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // Evidence files (docs/10 §3): local disk in development, Cloudflare R2 in
  // staging and production. The bucket stays private; files are served
  // through the API so every access is checked and logged.
  EVIDENCE_STORAGE: z.enum(["local", "r2"]).default("local"),
  EVIDENCE_DIR: z.string().default(".data/evidence"),
  R2_ENDPOINT: z.string().optional(),
  R2_ACCESS_KEY: z.string().optional(),
  R2_SECRET_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  /** Optional: an ffmpeg binary to use instead of the bundled one. */
  FFMPEG_PATH: z.string().optional(),
  // Mobile-app import (docs/11). Seconds between runs; 0 turns it off.
  APP_SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(0).default(60),
  /** Base URL for evidence paths the app stores without a host (e.g. "/api/evidence/r2/…"). */
  APP_MEDIA_BASE_URL: z.string().url().optional(),
  /**
   * Hosts the import may download evidence from (comma-separated; a leading
   * dot allows subdomains). Required in production — it stops the import being
   * pointed at internal addresses.
   */
  APP_MEDIA_ALLOWED_HOSTS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment settings:\n${problems}`);
  }
  const e = parsed.data;
  if (
    e.EVIDENCE_STORAGE === "r2" &&
    !(e.R2_ENDPOINT && e.R2_ACCESS_KEY && e.R2_SECRET_KEY && e.R2_BUCKET_NAME)
  ) {
    throw new Error(
      "EVIDENCE_STORAGE=r2 needs R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY and R2_BUCKET_NAME",
    );
  }
  if (
    e.NODE_ENV === "production" &&
    e.APP_SYNC_INTERVAL_SECONDS > 0 &&
    e.APP_MEDIA_ALLOWED_HOSTS.length === 0
  ) {
    throw new Error("Production needs APP_MEDIA_ALLOWED_HOSTS for the mobile-app import");
  }
  if (e.NODE_ENV === "production" && e.EVIDENCE_STORAGE !== "r2") {
    throw new Error("Production must store evidence in R2 (EVIDENCE_STORAGE=r2)");
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.COOKIE_SECURE) {
    throw new Error("COOKIE_SECURE must be true in production");
  }
  return parsed.data;
}

export const ENV = Symbol("ENV");

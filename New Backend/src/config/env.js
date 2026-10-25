// Every setting the backend reads, checked once at start-up (docs/19 §4).
// A missing or malformed setting stops the process with a clear message,
// instead of failing later in the middle of a request.

import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4200),
  /** Proxies in front of the API in production: 1 on Railway, 2 when Vercel forwards /api too. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

  MONGODB_URI: z.string().min(1, "Set MONGODB_URI to the MongoDB connection string."),
  MONGODB_DB_NAME: z.string().min(1).default("evigilance_new"),

  /** Signs access tokens and sign-in challenges. At least 32 random characters. */
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters."),
  /** Encrypts two-step sign-in secrets at rest. 64 hex characters (32 bytes). */
  MFA_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "MFA_ENCRYPTION_KEY must be 64 hex characters."),

  /** The browser origin of the admin panel, for CORS in production. */
  WEB_ORIGIN: z.string().url().default("http://localhost:5300"),

  R2_ENDPOINT: z.string().url().optional(),
  R2_ACCESS_KEY: z.string().optional(),
  R2_SECRET_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  /** "r2" or "local". Unset: R2 when its settings are complete, else a local folder. */
  EVIDENCE_STORAGE: z.enum(["r2", "local"]).optional(),
  EVIDENCE_LOCAL_DIR: z.string().default(".data/evidence"),
  /** Every object this build writes goes under this folder in the bucket. */
  R2_PREFIX: z.string().default("new e-vigilence/"),

  /** Mobile-app import (docs/11 §8): seconds between runs; 0 turns it off. */
  APP_IMPORT_INTERVAL_SECONDS: z.coerce.number().int().min(0).default(60),
  /** Base for evidence paths the app stores without a host. */
  APP_MEDIA_BASE_URL: z.string().url().optional(),
  /**
   * Sent as `X-Media-Key` when downloading the app's evidence; the app's
   * MEDIA_SERVICE_KEY. Needed once the app serves media only to signed links.
   */
  APP_MEDIA_KEY: z.string().min(24).optional(),
  /**
   * When the app keeps its evidence in our R2 bucket: the folder its files
   * are under (the app's R2_PREFIX and "/"). They are then read straight from
   * the bucket, and only keys under this folder. Empty: always download.
   */
  APP_R2_PREFIX: z
    .string()
    .default("evidence/")
    .refine((p) => p === "" || /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*\/$/.test(p), {
      message: 'APP_R2_PREFIX must be a folder ending in "/", e.g. evidence/, or empty.',
    }),
  /** Hosts evidence may be downloaded from, comma-separated; ".example.com" allows subdomains. Required in production. */
  APP_MEDIA_ALLOWED_HOSTS: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean),
    ),

  /** Signs the payment simulator's confirmations (docs/07 P5). 32+ characters; required in production. */
  PAYMENTS_SIM_SECRET: z
    .string()
    .min(32, "PAYMENTS_SIM_SECRET must be at least 32 characters.")
    .optional(),

  /** Password given to the demo accounts by `npm run seed`. */
  SEED_PASSWORD: z.string().min(12).optional(),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

/** @typedef {z.infer<typeof schema>} Env */

/**
 * Reads the settings from `source` (normally `process.env`).
 * @param {Record<string, string | undefined>} source
 * @returns {Env}
 */
export function loadEnv(source = process.env) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`The backend settings are not valid:\n${lines.join("\n")}`);
  }
  const env = result.data;
  if (
    env.NODE_ENV === "production" &&
    env.APP_IMPORT_INTERVAL_SECONDS > 0 &&
    env.APP_MEDIA_ALLOWED_HOSTS.length === 0
  ) {
    throw new Error(
      "The backend settings are not valid:\n  - APP_MEDIA_ALLOWED_HOSTS: list the mobile app's media hosts, or set APP_IMPORT_INTERVAL_SECONDS=0.",
    );
  }
  if (env.NODE_ENV === "production" && !env.PAYMENTS_SIM_SECRET) {
    throw new Error(
      "The backend settings are not valid:\n  - PAYMENTS_SIM_SECRET: set a 32+ character secret for payment confirmations.",
    );
  }
  return env;
}

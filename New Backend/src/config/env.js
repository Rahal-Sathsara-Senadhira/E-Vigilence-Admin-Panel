// Every setting the backend reads, checked once at start-up (docs/19 §4).
// A missing or malformed setting stops the process with a clear message,
// instead of failing later in the middle of a request.

import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4200),

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
  /** Every object this build writes goes under this folder in the bucket. */
  R2_PREFIX: z.string().default("new e-vigilence/"),

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
  return result.data;
}

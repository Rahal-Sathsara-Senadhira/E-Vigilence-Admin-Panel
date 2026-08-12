const NODE_ENV_RAW = process.env.NODE_ENV || "development";

// ✅ Fail loudly in production instead of silently running with a guessable secret
if (NODE_ENV_RAW === "production" && !process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET must be set when NODE_ENV=production. Refusing to start with the insecure default."
  );
}

export const env = {
  NODE_ENV: NODE_ENV_RAW,
  PORT: Number(process.env.PORT || 8081),

  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",

  // DB Provider (older code expects this)
  DB_PROVIDER: process.env.DB_PROVIDER || "mongo",

  // Mongo
  MONGO_URI: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/evigilence",

  // JWT (if your auth middleware uses it)
  JWT_SECRET: process.env.JWT_SECRET || "dev_secret_change_me",
};

// ✅ Backwards-compatible named exports (so older imports won't crash)
export const NODE_ENV = env.NODE_ENV;
export const PORT = env.PORT;
export const CORS_ORIGIN = env.CORS_ORIGIN;
export const DB_PROVIDER = env.DB_PROVIDER;
export const MONGO_URI = env.MONGO_URI;
export const JWT_SECRET = env.JWT_SECRET;
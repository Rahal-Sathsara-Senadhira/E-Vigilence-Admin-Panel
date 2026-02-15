import "dotenv/config";

export const PORT = process.env.PORT || 5000;
export const NODE_ENV = process.env.NODE_ENV || "development";
export const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

export const DB_PROVIDER = (process.env.DB_PROVIDER || "mongo").toLowerCase();
export const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/evigilence";

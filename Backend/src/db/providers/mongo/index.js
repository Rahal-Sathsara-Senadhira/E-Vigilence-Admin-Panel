import mongoose from "mongoose";
import { MONGO_URI } from "../../../config/env.js";

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 3000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Atlas connections can hit a transient TLS-handshake hang (seen in practice
// with Windows Defender's Network Inspection System interfering with
// less-common ports like 27017) — same URI, same network, alternates between
// connecting in under a second and timing out completely. Retrying a few
// times with a longer server-selection window rides out that flakiness
// instead of crashing the whole process on the first bad attempt.
export async function connectMongo() {
  if (!MONGO_URI) {
    throw new Error("MONGO_URI is missing. Add it to .env");
  }

  // Avoid reconnecting in dev reloads
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 20000,
      });
      console.log("✅ MongoDB connected");
      return mongoose.connection;
    } catch (err) {
      const isLastAttempt = attempt === MAX_ATTEMPTS;
      console.warn(
        `⚠️  MongoDB connection attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err.message}`
      );
      if (isLastAttempt) throw err;
      await sleep(RETRY_DELAY_MS);
    }
  }
}

// Backwards compatibility (if older code imports connectDB)
export const connectDB = connectMongo;
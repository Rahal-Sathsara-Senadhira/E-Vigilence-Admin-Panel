import mongoose from "mongoose";
import { MONGO_URI } from "../../../config/env.js";

export async function connectMongo() {
  if (!MONGO_URI) {
    throw new Error("MONGO_URI is missing. Add it to .env");
  }

  // Avoid reconnecting in dev reloads
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  await mongoose.connect(MONGO_URI, {
    // options are mostly auto in new mongoose versions
  });

  console.log("✅ MongoDB connected");
  return mongoose.connection;
}

// Backwards compatibility (if older code imports connectDB)
export const connectDB = connectMongo;
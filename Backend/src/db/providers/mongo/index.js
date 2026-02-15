import mongoose from "mongoose";
import { MONGO_URI } from "../../../config/env.js";

async function connect() {
  if (mongoose.connection.readyState === 1) return mongoose;

  await mongoose.connect(MONGO_URI, { autoIndex: true });
  console.log("✅ Connected to MongoDB");
  return mongoose;
}

async function disconnect() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  console.log("🛑 Disconnected from MongoDB");
}

function getClient() {
  return mongoose;
}

export default { connect, disconnect, getClient };

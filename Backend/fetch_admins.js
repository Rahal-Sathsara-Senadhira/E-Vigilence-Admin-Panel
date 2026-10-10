import mongoose from "mongoose";
import { MONGO_URI } from "./src/config/env.js";
import User from "./src/db/providers/mongo/models/User.js";

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    const users = await User.find({}, "-password_hash").lean();
    console.log(JSON.stringify(users, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();

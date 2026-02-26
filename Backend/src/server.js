import app from "./app.js";
import { env } from "./config/env.js";
import { connectMongo } from "./db/providers/mongo/index.js";

async function start() {
  try {
    console.log("⏳ Starting backend...");
    console.log("ENV PORT =", env.PORT);
    console.log("ENV MONGO_URI =", env.MONGO_URI);

    await connectMongo();

    app.listen(env.PORT, "0.0.0.0", () => {
      console.log(`✅ Backend running on http://localhost:${env.PORT}`);
    });
  } catch (err) {
    console.error("❌ Backend failed to start:", err);
    process.exit(1);
  }
}

start();
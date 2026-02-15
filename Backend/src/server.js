import app from "./app.js";
import db from "./db/index.js";
import { PORT } from "./config/env.js";

async function start() {
  await db.connect();

  app.listen(PORT, () => {
    console.log(`🚀 API running on http://localhost:${PORT}`);
    console.log(`🧩 DB Provider: ${db.getProviderName()}`);
  });
}

start().catch((err) => {
  console.error("❌ Failed to start server:", err);
  process.exit(1);
});

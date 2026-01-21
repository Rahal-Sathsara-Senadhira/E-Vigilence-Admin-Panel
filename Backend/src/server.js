import dotenv from "dotenv";
dotenv.config();

import { createApp } from "./app.js";
import { pool } from "./db/pool.js";

const app = createApp();
const PORT = process.env.PORT || 5000;

async function start() {
  await pool.query("SELECT 1;");
  console.log("✅ PostgreSQL connected");

  const dbName = await pool.query("SELECT current_database() AS db;");
  console.log("✅ Connected DB:", dbName.rows[0].db);

  const tables = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema='public'
    ORDER BY table_name;
  `);
  console.log("✅ Tables:", tables.rows.map(r => r.table_name));

  app.listen(PORT, () => {
    console.log(`✅ API running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("❌ Failed to start server:", err.message);
  process.exit(1);
});

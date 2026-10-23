// Loads apps/api/.env when present (local development). Imported first in
// main.ts, before any module reads process.env. In staging and production
// the variables come from the environment itself.
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

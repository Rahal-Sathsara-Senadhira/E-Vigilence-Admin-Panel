import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inject } from "vitest";

// A fresh database per test file, on the shared replica set.
const base = new URL(inject("mongoUri"));
base.pathname = `/ev_test_${randomBytes(4).toString("hex")}`;

process.env.NODE_ENV = "test";
process.env.MONGODB_URI = base.toString();
process.env.JWT_ACCESS_SECRET = randomBytes(48).toString("base64url");
process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.COOKIE_SECURE = "false";
process.env.WEB_ORIGIN = "http://localhost:5280";
process.env.EVIDENCE_STORAGE = "local";
process.env.EVIDENCE_DIR = join(tmpdir(), `ev-evidence-${randomBytes(4).toString("hex")}`);

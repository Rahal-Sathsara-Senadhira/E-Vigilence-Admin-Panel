// Production settings — what keeps the deployed backend safe (docs/22):
// evidence never on the host's disk; cross-origin calls only from the panel.

import { describe, expect, it } from "vitest";
import supertest from "supertest";
import { createApp, storageFrom } from "#src/app.js";
import { loadEnv } from "#src/config/env.js";
import { createLogger } from "#src/core/logger.js";

const base = {
  MONGODB_URI: "mongodb://localhost:1/none",
  JWT_SECRET: "x".repeat(40),
  MFA_ENCRYPTION_KEY: "a".repeat(64),
  PAYMENTS_SIM_SECRET: "s".repeat(40),
  APP_IMPORT_INTERVAL_SECONDS: "0",
};

describe("production", () => {
  it("refuses to keep evidence on local disk", () => {
    const env = loadEnv({ ...base, NODE_ENV: "production" });
    expect(() => storageFrom(env)).toThrow(/needs R2/);
  });

  it("requires the payment secret", () => {
    const { PAYMENTS_SIM_SECRET: _omit, ...rest } = base;
    expect(() => loadEnv({ ...rest, NODE_ENV: "production" })).toThrow(/PAYMENTS_SIM_SECRET/);
  });

  it("answers cross-origin calls from the panel's address only, without cookies", async () => {
    const env = loadEnv({ ...base, NODE_ENV: "test", WEB_ORIGIN: "https://panel.example.lk" });
    const app = createApp({ env, logger: createLogger({ level: "silent" }) });
    const ok = await supertest(app)
      .options("/api/v1/health")
      .set("Origin", "https://panel.example.lk")
      .set("Access-Control-Request-Method", "POST");
    expect(ok.status).toBe(204);
    expect(ok.headers["access-control-allow-origin"]).toBe("https://panel.example.lk");
    expect(ok.headers["access-control-allow-credentials"]).toBeUndefined();
    const other = await supertest(app)
      .get("/api/v1/health")
      .set("Origin", "https://evil.example.com");
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

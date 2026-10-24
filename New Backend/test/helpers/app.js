// A test app on its own database, plus factories for accounts.

import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { generate } from "otplib";
import supertest from "supertest";
import { inject } from "vitest";
import { createApp } from "#src/app.js";
import { loadEnv } from "#src/config/env.js";
import { hashPassword } from "#src/core/auth/passwords.js";
import { createLogger } from "#src/core/logger.js";
import { createStorage } from "#src/core/storage.js";
import os from "node:os";
import path from "node:path";
import { Division, Station } from "#src/modules/organisation/organisation.model.js";
import { User } from "#src/modules/users/user.model.js";

export const PASSWORD = "Correct-Horse-Battery-9";
export const CSRF = { "X-Requested-With": "e-vigilance" };

export async function createTestApp() {
  const dbName = `test_${randomBytes(4).toString("hex")}`;
  const env = loadEnv({
    NODE_ENV: "test",
    MONGODB_URI: inject("mongoUri"),
    MONGODB_DB_NAME: dbName,
    JWT_SECRET: randomBytes(48).toString("base64url"),
    MFA_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    LOG_LEVEL: "silent",
  });
  await mongoose.connect(env.MONGODB_URI, { dbName });
  await mongoose.connection.syncIndexes();
  // Evidence goes to a temporary folder, never to R2.
  const storage = createStorage({
    driver: "local",
    localDir: path.join(os.tmpdir(), `ev-test-${dbName}`),
  });
  const app = createApp({ env, logger: createLogger({ level: "silent" }), storage });
  return {
    app,
    env,
    storage,
    http: () => supertest(app),
    close: async () => {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    },
  };
}

let counter = 0;

/**
 * Creates an account. Station and division roles get an active station or
 * division unless one is given.
 * @param {{ role: string, password?: string, mustChangePassword?: boolean, email?: string | null,
 *   serviceNumber?: string | null, name?: string, isActive?: boolean, stationId?: any, divisionId?: any }} input
 */
export async function createUser(input) {
  counter += 1;
  const level = ["station_oic", "traffic_officer", "station_clerk"].includes(input.role)
    ? "station"
    : input.role === "division_supervisor"
      ? "division"
      : "national";
  let { stationId, divisionId } = input;
  if (level === "station" && !stationId) {
    const [s] = await Station.create([{ name: `Station ${counter}`, code: `ST${counter}` }]);
    stationId = s?._id;
  }
  if (level === "division" && !divisionId) {
    const [d] = await Division.create([{ name: `Division ${counter}`, code: `DV${counter}` }]);
    divisionId = d?._id;
  }
  const [user] = await User.create([
    {
      name: input.name ?? `Test Person ${counter}`,
      email: input.email === undefined ? `user${counter}@police.test` : input.email,
      serviceNumber:
        input.serviceNumber === undefined ? `SN${10000 + counter}` : input.serviceNumber,
      role: input.role,
      stationId: stationId ?? null,
      divisionId: divisionId ?? null,
      isActive: input.isActive ?? true,
      passwordHash: await hashPassword(input.password ?? PASSWORD),
      mustChangePassword: input.mustChangePassword ?? false,
    },
  ]);
  return /** @type {NonNullable<typeof user>} */ (user);
}

/** The current authenticator code for a plain secret. @param {string} secret @returns {Promise<string>} */
export const totpNow = (secret) => generate({ secret });

/** Reads the refresh cookie from a response. @param {import("supertest").Response} res */
export function refreshCookieOf(res) {
  const raw = /** @type {string[] | undefined} */ (
    /** @type {unknown} */ (res.headers["set-cookie"])
  );
  const cookie = raw?.find((c) => c.startsWith("ev_rt="));
  return cookie ? cookie.split(";")[0] : null;
}

/**
 * Signs an account in and returns its access token, setting up two-step
 * sign-in first when the role requires it.
 * @param {Awaited<ReturnType<typeof createTestApp>>} t
 * @param {{ email?: string | null, serviceNumber?: string | null }} user
 * @param {string} [password]
 */
export async function signInAs(t, user, password = PASSWORD) {
  const post = (/** @type {string} */ path, /** @type {object} */ body) =>
    t.http().post(`/api/v1/auth/${path}`).set(CSRF).send(body);
  const first = await post("sign-in", { identifier: user.email ?? user.serviceNumber, password });
  let result = first.body;
  if (result.status === "mfa_setup_required") {
    const start = await post("mfa/setup/start", { challenge: result.challenge });
    result = (
      await post("mfa/setup/confirm", {
        challenge: result.challenge,
        code: await totpNow(start.body.secret),
      })
    ).body;
  }
  if (result.status !== "signed_in")
    throw new Error(`Sign-in stopped at ${JSON.stringify(result)}`);
  return /** @type {string} */ (result.session.accessToken);
}

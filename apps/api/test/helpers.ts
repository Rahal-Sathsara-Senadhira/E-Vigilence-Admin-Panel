import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { getConnectionToken, getModelToken } from "@nestjs/mongoose";
import { DiscoveryModule } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { StaffRole } from "@ev/shared";
import type { Connection, Model } from "mongoose";
import { Types } from "mongoose";
import { generate, generateSecret } from "otplib";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { CryptoService } from "../src/modules/auth/crypto.service";
import { Station } from "../src/modules/stations/station.schema";
import { StaffUser } from "../src/modules/users/user.schema";

export const PASSWORD = "Test-Password-2026!";
export const CSRF = { "X-Requested-With": "e-vigilance" };

export interface TestApp {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  conn: Connection;
  users: Model<StaffUser>;
  stations: Model<Station>;
  crypto: CryptoService;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, DiscoveryModule],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  await app.listen(0); // one listening server, so overlapping requests share it
  const conn = app.get<Connection>(getConnectionToken());
  await conn.syncIndexes();
  return {
    app,
    http: () => request(app.getHttpServer()),
    conn,
    users: app.get(getModelToken(StaffUser.name)),
    stations: app.get(getModelToken(Station.name)),
    crypto: app.get(CryptoService),
    close: async () => {
      await conn.dropDatabase();
      await app.close();
    },
  };
}

let stationCounter = 0;
export async function createStation(t: TestApp, name = `Test Station ${++stationCounter}`) {
  const [s] = await t.stations.create([
    {
      name,
      isActive: true,
      verified: true,
      location: { type: "Point", coordinates: [79.86, 6.93] },
    },
  ]);
  return String(s!._id);
}

let userCounter = 0;
export interface StaffOptions {
  role: StaffRole;
  stationId?: string | null;
  email?: string;
  active?: boolean;
  mustChangePassword?: boolean;
  /** Enable two-step sign-in with a known secret (required for hq/dev). */
  mfa?: boolean;
}

export async function createStaff(t: TestApp, opts: StaffOptions) {
  const n = ++userCounter;
  const needsMfa = opts.mfa ?? (opts.role === "hq" || opts.role === "dev");
  const secret = needsMfa ? generateSecret() : null;
  const [u] = await t.users.create([
    {
      staff: true,
      name: `Test User ${n}`,
      email: opts.email ?? `user${n}.${opts.role}@police.test`,
      nic: `19900000${String(n).padStart(4, "0")}`,
      role: opts.role,
      stationId: opts.stationId ? new Types.ObjectId(opts.stationId) : null,
      active: opts.active ?? true,
      passwordHash: await t.crypto.hashPassword(PASSWORD),
      mustChangePassword: opts.mustChangePassword ?? false,
      mfa: secret
        ? {
            enabled: true,
            secretEnc: t.crypto.encrypt(secret),
            pendingSecretEnc: null,
            lastTimeStep: null,
            enabledAt: new Date(),
          }
        : {},
    },
  ]);
  return {
    id: String(u!._id),
    email: u!.email,
    role: opts.role,
    stationId: opts.stationId ?? null,
    secret,
  };
}

export type Staff = Awaited<ReturnType<typeof createStaff>>;

// Codes can't be reused (afterTimeStep), so a second sign-in by the same user
// within 30 seconds uses the next step's code — accepted within the
// one-step tolerance.
const codesUsed = new Map<string, number>();
export async function nextCode(secret: string) {
  const used = codesUsed.get(secret) ?? 0;
  codesUsed.set(secret, used + 1);
  if (used > 1) throw new Error("Test signs in the same MFA user more than twice");
  return generate({ secret, epoch: Math.floor(Date.now() / 1000) + used * 30 });
}

/** Signs in (with the authenticator step when enabled) and returns the token and refresh cookie. */
export async function signIn(
  t: TestApp,
  user: Pick<Staff, "email" | "secret">,
  password = PASSWORD,
) {
  let res = await t.http().post("/api/v1/auth/login").send({ email: user.email, password });
  if (res.body.status === "mfaRequired") {
    const code = await nextCode(user.secret!);
    res = await t
      .http()
      .post("/api/v1/auth/mfa/verify")
      .send({ challengeToken: res.body.challengeToken, code });
  }
  if (res.body.status !== "signedIn")
    throw new Error(`Sign-in failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    token: res.body.session.accessToken as string,
    cookie: refreshCookieOf(res),
    user: res.body.session.user,
  };
}

export function refreshCookieOf(res: request.Response): string {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith("ev_rt="));
  if (!cookie) throw new Error("No refresh cookie set");
  return cookie.split(";")[0]!;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

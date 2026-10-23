// Sign-in, two-step codes, sessions — docs/17 §6, docs/01 R3.

import { generate } from "otplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CSRF,
  PASSWORD,
  bearer,
  createStaff,
  createStation,
  createTestApp,
  refreshCookieOf,
  signIn,
  type TestApp,
} from "./helpers";

let t: TestApp;
let stationId: string;

beforeAll(async () => {
  t = await createTestApp();
  stationId = await createStation(t);
});
afterAll(() => t.close());

describe("password step", () => {
  it("signs in an officer without two-step and sets an httpOnly, SameSite=Strict cookie", async () => {
    const officer = await createStaff(t, { role: "station_officer", stationId });
    const res = await t
      .http()
      .post("/api/v1/auth/login")
      .send({ email: officer.email.toUpperCase(), password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("signedIn");
    expect(res.body.session.user).toMatchObject({ role: "station_officer", stationId });
    const cookie = (res.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith("ev_rt="),
    )!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const officer = await createStaff(t, { role: "station_officer", stationId });
    const wrong = await t
      .http()
      .post("/api/v1/auth/login")
      .send({ email: officer.email, password: "nope-nope-nope" });
    const unknown = await t
      .http()
      .post("/api/v1/auth/login")
      .send({ email: "nobody@police.test", password: "nope-nope-nope" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it("locks the account for 15 minutes after five failures, even with the right password", async () => {
    const officer = await createStaff(t, { role: "station_officer", stationId });
    for (let i = 0; i < 5; i++) {
      await t
        .http()
        .post("/api/v1/auth/login")
        .send({ email: officer.email, password: "wrong-password-x" });
    }
    const res = await t
      .http()
      .post("/api/v1/auth/login")
      .send({ email: officer.email, password: PASSWORD });
    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe("account_locked");
  });

  it("refuses a deactivated account", async () => {
    const officer = await createStaff(t, { role: "station_officer", stationId, active: false });
    const res = await t
      .http()
      .post("/api/v1/auth/login")
      .send({ email: officer.email, password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("account_inactive");
  });
});

describe("two-step sign-in (TOTP) for HQ and dev", () => {
  it("makes an HQ user without an authenticator set one up before signing in", async () => {
    const hq = await createStaff(t, { role: "hq", mfa: false });
    const login = await t
      .http()
      .post("/api/v1/auth/login")
      .send({ email: hq.email, password: PASSWORD });
    expect(login.body.status).toBe("mfaSetupRequired");

    // The set-up challenge grants nothing else.
    const sneaky = await t.http().get("/api/v1/auth/me").set(bearer(login.body.challengeToken));
    expect(sneaky.status).toBe(401);

    const setup = await t
      .http()
      .post("/api/v1/auth/mfa/setup")
      .send({ challengeToken: login.body.challengeToken });
    expect(setup.status).toBe(200);
    expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);

    const bad = await t
      .http()
      .post("/api/v1/auth/mfa/setup/confirm")
      .send({ challengeToken: login.body.challengeToken, code: "000000" });
    expect(bad.status).toBe(401);

    const code = await generate({ secret: setup.body.secret });
    const done = await t
      .http()
      .post("/api/v1/auth/mfa/setup/confirm")
      .send({ challengeToken: login.body.challengeToken, code });
    expect(done.status).toBe(200);
    expect(done.body.session.user.mfaEnabled).toBe(true);
  });

  it("asks for a code when two-step is on, and refuses the same code twice", async () => {
    const hq = await createStaff(t, { role: "hq" });
    const first = await t
      .http()
      .post("/api/v1/auth/login")
      .send({ email: hq.email, password: PASSWORD });
    expect(first.body.status).toBe("mfaRequired");
    const code = await generate({ secret: hq.secret! });
    const ok = await t
      .http()
      .post("/api/v1/auth/mfa/verify")
      .send({ challengeToken: first.body.challengeToken, code });
    expect(ok.status).toBe(200);

    const second = await t
      .http()
      .post("/api/v1/auth/login")
      .send({ email: hq.email, password: PASSWORD });
    const replay = await t
      .http()
      .post("/api/v1/auth/mfa/verify")
      .send({ challengeToken: second.body.challengeToken, code });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("invalid_code");
  });
});

describe("sessions", () => {
  it("rotates the refresh token and ends the session when an old one is replayed", async () => {
    const officer = await createStaff(t, { role: "station_officer", stationId });
    const s = await signIn(t, officer);

    const noHeader = await t.http().post("/api/v1/auth/refresh").set("Cookie", s.cookie);
    expect(noHeader.status).toBe(403); // CSRF header required

    const r1 = await t.http().post("/api/v1/auth/refresh").set("Cookie", s.cookie).set(CSRF);
    expect(r1.status).toBe(200);
    const newCookie = refreshCookieOf(r1);
    expect(newCookie).not.toBe(s.cookie);

    // Pretend the grace period has passed, then replay the old cookie.
    await t.conn
      .collection("staff_sessions")
      .updateMany({}, { $set: { rotatedAt: new Date(Date.now() - 60_000) } });
    const replay = await t.http().post("/api/v1/auth/refresh").set("Cookie", s.cookie).set(CSRF);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("session_revoked");

    // The thief's replay ended the whole session, including the new token.
    const after = await t.http().post("/api/v1/auth/refresh").set("Cookie", newCookie).set(CSRF);
    expect(after.status).toBe(401);
    const me = await t.http().get("/api/v1/auth/me").set(bearer(r1.body.accessToken));
    expect(me.status).toBe(401);
  });

  it("asks a second tab to retry when two refreshes race", async () => {
    const officer = await createStaff(t, { role: "station_officer", stationId });
    const s = await signIn(t, officer);
    await t.http().post("/api/v1/auth/refresh").set("Cookie", s.cookie).set(CSRF);
    const racing = await t.http().post("/api/v1/auth/refresh").set("Cookie", s.cookie).set(CSRF);
    expect(racing.status).toBe(409);
    expect(racing.body.error.code).toBe("refresh_retry");
  });

  it("signing out ends the session", async () => {
    const officer = await createStaff(t, { role: "station_officer", stationId });
    const s = await signIn(t, officer);
    const out = await t.http().post("/api/v1/auth/logout").set("Cookie", s.cookie).set(CSRF);
    expect(out.status).toBe(204);
    expect((await t.http().get("/api/v1/auth/me").set(bearer(s.token))).status).toBe(401);
  });

  it("re-checks the account on every request — deactivation applies immediately (R3)", async () => {
    const officer = await createStaff(t, { role: "station_officer", stationId });
    const s = await signIn(t, officer);
    expect((await t.http().get("/api/v1/auth/me").set(bearer(s.token))).status).toBe(200);
    await t.users.updateOne({ email: officer.email }, { $set: { active: false } });
    const res = await t.http().get("/api/v1/auth/me").set(bearer(s.token));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("account_inactive");
  });
});

describe("temporary passwords", () => {
  it("blocks everything except changing the password, then lets the user in", async () => {
    const officer = await createStaff(t, {
      role: "station_officer",
      stationId,
      mustChangePassword: true,
    });
    const s = await signIn(t, officer);

    const blocked = await t.http().get("/api/v1/stations").set(bearer(s.token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("password_change_required");

    const weak = await t
      .http()
      .post("/api/v1/auth/change-password")
      .set(bearer(s.token))
      .send({ currentPassword: PASSWORD, newPassword: "password1234" });
    expect(weak.status).toBe(400);
    expect(weak.body.error.fields.newPassword).toBeDefined();

    const changed = await t
      .http()
      .post("/api/v1/auth/change-password")
      .set(bearer(s.token))
      .send({ currentPassword: PASSWORD, newPassword: "Galle-Fort-Lighthouse-9" });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);

    // The old access token's session was replaced.
    expect((await t.http().get("/api/v1/auth/me").set(bearer(s.token))).status).toBe(401);
    const ok = await t.http().get("/api/v1/stations").set(bearer(changed.body.accessToken));
    expect(ok.status).toBe(200);
  });
});

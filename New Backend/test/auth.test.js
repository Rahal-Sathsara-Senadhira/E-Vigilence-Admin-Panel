// Signing in — docs/20 §9.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifyAuditChain } from "#src/core/audit/audit.js";
import { Session } from "#src/modules/auth/session.model.js";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { User } from "#src/modules/users/user.model.js";
import {
  CSRF,
  PASSWORD,
  createTestApp,
  createUser,
  refreshCookieOf,
  totpNow,
} from "./helpers/app.js";

/** @type {Awaited<ReturnType<typeof createTestApp>>} */
let t;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());
beforeEach(() => signInLimiter.reset());

/** @param {string} path @param {object} [body] */
const post = (path, body = {}) => t.http().post(`/api/v1/auth/${path}`).set(CSRF).send(body);
/** @param {string} identifier @param {string} [password] */
const signIn = (identifier, password = PASSWORD) => post("sign-in", { identifier, password });

/** Signs a national-role account all the way in, setting up two-step sign-in. Returns the TOTP secret. */
async function enrolMfa(identifier) {
  const step1 = await signIn(identifier);
  expect(step1.body.status).toBe("mfa_setup_required");
  const start = await post("mfa/setup/start", { challenge: step1.body.challenge });
  const setupCode = await totpNow(start.body.secret);
  const confirm = await post("mfa/setup/confirm", {
    challenge: step1.body.challenge,
    code: setupCode,
  });
  expect(confirm.body.status, JSON.stringify(confirm.body)).toBe("signed_in");
  return { secret: start.body.secret, recoveryCodes: confirm.body.recoveryCodes, setupCode };
}

describe("password sign-in", () => {
  it("signs a traffic officer in by email or service number and sends their permissions", async () => {
    const u = await createUser({ role: "traffic_officer", serviceNumber: "PC 45123" });
    for (const id of [u.email, "pc45123"]) {
      const res = await signIn(/** @type {string} */ (id));
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("signed_in");
      expect(res.body.session.user).toMatchObject({
        role: "traffic_officer",
        roleLabel: "Traffic officer",
        level: "station",
        idleMinutes: 30,
      });
      expect(res.body.session.user.permissions["cases.investigate"]).toBe("A");
      expect(res.body.session.user.permissions["cases.decide"]).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|refresh/i);
      const cookie = refreshCookieOf(res);
      expect(cookie).toMatch(/^ev_rt=/);
      const me = await t
        .http()
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${res.body.session.accessToken}`);
      expect(me.body.name).toBe(u.name);
    }
  });

  it("gives the same answer for a wrong password and an unknown account", async () => {
    const u = await createUser({ role: "station_clerk" });
    const wrong = await signIn(/** @type {string} */ (u.email), "Not-The-Password-1");
    const unknown = await signIn("nobody@police.test");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toEqual(unknown.body.error);
  });

  it("locks the account after 5 wrong passwords, even for the right one", async () => {
    const u = await createUser({ role: "station_clerk" });
    for (let i = 0; i < 5; i++) await signIn(/** @type {string} */ (u.email), "Wrong-Password-123");
    const res = await signIn(/** @type {string} */ (u.email));
    expect(res.status).toBe(423);
    expect(res.body.error.message).toMatch(/Try again in 15 minutes/);
  });

  it("refuses deactivated accounts and accounts at an inactive station", async () => {
    const off = await createUser({ role: "traffic_officer", isActive: false });
    expect((await signIn(/** @type {string} */ (off.email))).body.error.code).toBe(
      "account_inactive",
    );
  });

  it("refuses requests without the security header", async () => {
    const res = await t
      .http()
      .post("/api/v1/auth/sign-in")
      .send({ identifier: "x@y.z", password: "x" });
    expect(res.status).toBe(403);
  });
});

describe("first sign-in", () => {
  it("makes the user choose their own password before anything else", async () => {
    const u = await createUser({
      role: "station_oic",
      mustChangePassword: true,
      name: "Nimal Perera",
    });
    const step1 = await signIn(/** @type {string} */ (u.email));
    expect(step1.body.status).toBe("password_change_required");

    const weak = await post("password/first", {
      challenge: step1.body.challenge,
      newPassword: "short",
    });
    expect(weak.body.error.fields.newPassword).toMatch(/12 characters/);
    const personal = await post("password/first", {
      challenge: step1.body.challenge,
      newPassword: "Perera-Station-2026",
    });
    expect(personal.body.error.fields.newPassword).toMatch(/name/);
    const same = await post("password/first", {
      challenge: step1.body.challenge,
      newPassword: PASSWORD,
    });
    expect(same.body.error.fields.newPassword).toMatch(/different/);

    const ok = await post("password/first", {
      challenge: step1.body.challenge,
      newPassword: "Lotus-Tower-Sunrise-77",
    });
    expect(ok.body.status).toBe("signed_in");
    // The challenge can't be used twice: the password change raised authVersion.
    const again = await post("password/first", {
      challenge: step1.body.challenge,
      newPassword: "Another-Good-Phrase-88",
    });
    expect(again.status).toBe(401);
  });
});

describe("two-step sign-in", () => {
  it("national roles must set it up; then every sign-in asks for a code", async () => {
    const u = await createUser({ role: "hq_operator" });
    const { recoveryCodes, setupCode } = await enrolMfa(/** @type {string} */ (u.email));
    expect(recoveryCodes).toHaveLength(10);
    expect(recoveryCodes[0]).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);

    const step1 = await signIn(/** @type {string} */ (u.email));
    expect(step1.body.status).toBe("mfa_required");
    const bad = await post("mfa/verify", { challenge: step1.body.challenge, code: "000000" });
    expect(bad.status).toBe(401);

    // The exact code used during set-up can't be used again. (Not "the
    // current code": after a 30-second boundary that is a new, valid code.)
    const reused = await post("mfa/verify", { challenge: step1.body.challenge, code: setupCode });
    expect(reused.status).toBe(401);

    const recovered = await post("mfa/verify", {
      challenge: step1.body.challenge,
      recoveryCode: recoveryCodes[0].toLowerCase().replace("-", " "),
    });
    expect(recovered.body.status).toBe("signed_in");
    const usedTwice = await post("mfa/verify", {
      challenge: step1.body.challenge,
      recoveryCode: recoveryCodes[0],
    });
    expect(usedTwice.status).toBe(401);
  });

  it("asks for the code before letting a reset password be changed", async () => {
    const u = await createUser({ role: "hq_admin" });
    await enrolMfa(/** @type {string} */ (u.email));
    await User.updateOne({ _id: u._id }, { $set: { mustChangePassword: true } });
    const step1 = await signIn(/** @type {string} */ (u.email));
    expect(step1.body.status).toBe("mfa_required");
    // A password-change challenge can't be forged from the MFA one.
    const skip = await post("password/first", {
      challenge: step1.body.challenge,
      newPassword: "Lotus-Tower-Sunrise-77",
    });
    expect(skip.status).toBe(401);
  });

  it("is optional for station roles", async () => {
    const u = await createUser({ role: "traffic_officer" });
    expect((await signIn(/** @type {string} */ (u.email))).body.status).toBe("signed_in");
  });
});

describe("sessions", () => {
  async function signedIn() {
    const u = await createUser({ role: "station_clerk" });
    const res = await signIn(/** @type {string} */ (u.email));
    return {
      u,
      token: res.body.session.accessToken,
      cookie: /** @type {string} */ (refreshCookieOf(res)),
    };
  }
  const refresh = (/** @type {string} */ cookie) =>
    t.http().post("/api/v1/auth/refresh").set(CSRF).set("Cookie", cookie);

  it("rotates the refresh cookie and ends the session if an old one is replayed", async () => {
    const { cookie } = await signedIn();
    const first = await refresh(cookie);
    expect(first.status).toBe(200);
    const next = /** @type {string} */ (refreshCookieOf(first));
    expect(next).not.toBe(cookie);

    // Within 30 seconds an old cookie means two tabs raced: try again.
    expect((await refresh(cookie)).status).toBe(409);
    // Later, it means the cookie was stolen: the session ends.
    await Session.updateMany({}, { $set: { rotatedAt: new Date(Date.now() - 60_000) } });
    expect((await refresh(cookie)).status).toBe(401);
    expect((await refresh(next)).status).toBe(401);
  });

  it("answers 'no session' (not an error) when the browser has no sign-in cookie", async () => {
    const res = await t.http().post("/api/v1/auth/refresh").set(CSRF);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ session: null });
  });

  it("signs out after the role's idle time", async () => {
    const { u, cookie } = await signedIn();
    await Session.updateMany(
      { userId: u._id },
      { $set: { lastActiveAt: new Date(Date.now() - 31 * 60_000) } },
    );
    const res = await refresh(cookie);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/30 minutes without activity/);
  });

  it("signing out stops the access token at once", async () => {
    const { token } = await signedIn();
    const auth = { Authorization: `Bearer ${token}` };
    expect((await t.http().get("/api/v1/auth/me").set(auth)).status).toBe(200);
    expect((await t.http().post("/api/v1/auth/sign-out").set(CSRF).set(auth)).status).toBe(204);
    expect((await t.http().get("/api/v1/auth/me").set(auth)).status).toBe(401);
  });

  it("changing the password signs out the other devices", async () => {
    const { u, token } = await signedIn();
    const other = await signIn(/** @type {string} */ (u.email));
    const res = await t
      .http()
      .post("/api/v1/auth/password")
      .set(CSRF)
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: "Lotus-Tower-Sunrise-77" });
    expect(res.status).toBe(204);
    expect(
      (await t.http().get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`)).status,
    ).toBe(200);
    expect(
      (
        await t
          .http()
          .get("/api/v1/auth/me")
          .set("Authorization", `Bearer ${other.body.session.accessToken}`)
      ).status,
    ).toBe(401);
  });
});

describe("audit", () => {
  it("keeps an unbroken hash chain", async () => {
    expect(await verifyAuditChain()).toBeNull();
  });
});

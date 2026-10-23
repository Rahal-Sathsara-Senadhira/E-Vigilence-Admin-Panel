// Staff accounts — docs/20 §6 (who manages whom), S5, §9.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifyAuditChain } from "#src/core/audit/audit.js";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { Division, Station } from "#src/modules/organisation/organisation.model.js";
import { User } from "#src/modules/users/user.model.js";
import { CSRF, createTestApp, createUser, signInAs } from "./helpers/app.js";

/** @type {Awaited<ReturnType<typeof createTestApp>>} */
let t;
let kandy;
let galle;
let kandyDivision;

beforeAll(async () => {
  t = await createTestApp();
  [kandyDivision] = await Division.create([{ name: "Kandy Division", code: "KDY" }]);
  [kandy] = await Station.create([{ name: "Kandy", code: "K1", divisionId: kandyDivision._id }]);
  [galle] = await Station.create([{ name: "Galle", code: "G1" }]);
});
afterAll(() => t.close());
beforeEach(() => signInLimiter.reset());

/** @param {string} token */
const as = (token) => ({
  get: (/** @type {string} */ path) =>
    t.http().get(`/api/v1${path}`).set("Authorization", `Bearer ${token}`),
  post: (/** @type {string} */ path, /** @type {object} */ body = {}) =>
    t.http().post(`/api/v1${path}`).set(CSRF).set("Authorization", `Bearer ${token}`).send(body),
  put: (/** @type {string} */ path, /** @type {object} */ body) =>
    t.http().put(`/api/v1${path}`).set(CSRF).set("Authorization", `Bearer ${token}`).send(body),
});

let n = 0;
const newPerson = (/** @type {object} */ extra) => {
  n += 1;
  return {
    name: `New Person ${n}`,
    email: `new${n}@police.test`,
    serviceNumber: `NP${n}00`,
    ...extra,
  };
};

describe("HQ administrator", () => {
  it("creates station staff with a temporary password they must change", async () => {
    const admin = await createUser({ role: "hq_admin" });
    const hq = as(await signInAs(t, admin));
    const res = await hq.post(
      "/users",
      newPerson({ role: "station_oic", stationId: String(kandy._id) }),
    );
    expect(res.status).toBe(201);
    expect(res.body.account).toMatchObject({
      role: "station_oic",
      station: { name: "Kandy" },
      division: { name: "Kandy Division" },
      mustChangePassword: true,
    });
    expect(res.body.temporaryPassword).toMatch(/^[A-Z][a-z2-9]{3}(-[A-Z][a-z2-9]{3}){2}$/);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|recoveryCode/);

    const first = await t
      .http()
      .post("/api/v1/auth/sign-in")
      .set(CSRF)
      .send({ identifier: res.body.account.email, password: res.body.temporaryPassword });
    expect(first.body.status).toBe("password_change_required");
  });

  it("can't create administrators, and needs a station for station roles", async () => {
    const hq = as(await signInAs(t, await createUser({ role: "hq_admin" })));
    expect(
      (await hq.post("/users", newPerson({ role: "hq_admin" }))).body.error.fields.role,
    ).toBeTruthy();
    expect(
      (await hq.post("/users", newPerson({ role: "system_admin" }))).body.error.fields.role,
    ).toBeTruthy();
    expect(
      (await hq.post("/users", newPerson({ role: "traffic_officer" }))).body.error.fields.stationId,
    ).toBe("Choose the station.");
  });

  it("refuses an email or service number already in use", async () => {
    const hq = as(await signInAs(t, await createUser({ role: "hq_admin" })));
    const taken = await createUser({ role: "station_clerk", serviceNumber: "TAKEN1" });
    const res = await hq.post(
      "/users",
      newPerson({ role: "auditor", email: taken.email, serviceNumber: "taken 1" }),
    );
    expect(res.body.error.fields).toMatchObject({
      email: expect.any(String),
      serviceNumber: expect.any(String),
    });
  });

  it("changing someone's role signs them out so the new access applies", async () => {
    const hq = as(await signInAs(t, await createUser({ role: "hq_admin" })));
    const officer = await createUser({ role: "traffic_officer", stationId: kandy._id });
    const officerToken = await signInAs(t, officer);
    const res = await hq.put(`/users/${officer._id}`, {
      name: officer.name,
      email: officer.email,
      serviceNumber: officer.serviceNumber,
      role: "station_clerk",
      stationId: String(kandy._id),
    });
    expect(res.body.role).toBe("station_clerk");
    expect((await as(officerToken).get("/auth/me")).status).toBe(401);
  });

  it("resets a password: temporary password, unlocked, signed out everywhere", async () => {
    const hq = as(await signInAs(t, await createUser({ role: "hq_admin" })));
    const officer = await createUser({ role: "traffic_officer", stationId: kandy._id });
    const officerToken = await signInAs(t, officer);
    await User.updateOne(
      { _id: officer._id },
      { $set: { lockedUntil: new Date(Date.now() + 600_000) } },
    );
    const res = await hq.post(`/users/${officer._id}/reset-password`);
    expect(res.body.account).toMatchObject({ status: "active", mustChangePassword: true });
    expect((await as(officerToken).get("/auth/me")).status).toBe(401);
    const again = await t
      .http()
      .post("/api/v1/auth/sign-in")
      .set(CSRF)
      .send({ identifier: officer.email, password: res.body.temporaryPassword });
    expect(again.body.status).toBe("password_change_required");
  });

  it("deactivates with a reason; the account can no longer sign in", async () => {
    const hq = as(await signInAs(t, await createUser({ role: "hq_admin" })));
    const clerk = await createUser({ role: "station_clerk", stationId: kandy._id });
    expect((await hq.post(`/users/${clerk._id}/deactivate`, { reason: "x" })).status).toBe(400);
    const res = await hq.post(`/users/${clerk._id}/deactivate`, {
      reason: "Transferred out of the police",
    });
    expect(res.body.status).toBe("inactive");
    expect(
      (
        await t
          .http()
          .post("/api/v1/auth/sign-in")
          .set(CSRF)
          .send({ identifier: clerk.email, password: "Correct-Horse-Battery-9" })
      ).body.error.code,
    ).toBe("account_inactive");
    expect((await hq.post(`/users/${clerk._id}/reactivate`)).body.status).toBe("active");
  });

  it("resets two-step sign-in for a lost phone", async () => {
    const hq = as(await signInAs(t, await createUser({ role: "hq_admin" })));
    const operator = await createUser({ role: "hq_operator" });
    await signInAs(t, operator); // sets up two-step sign-in
    const res = await hq.post(`/users/${operator._id}/reset-two-step`, {
      reason: "Phone lost on duty",
    });
    expect(res.body.mfa.enabled).toBe(false);
  });
});

describe("no self-administration (S5) and the last system administrator", () => {
  it("nobody changes their own account", async () => {
    const admin = await createUser({ role: "hq_admin" });
    const hq = as(await signInAs(t, admin));
    const self = await hq.post(`/users/${admin._id}/reset-password`);
    expect(self.status).toBe(403);
    expect((await hq.get(`/users/${admin._id}`)).body.can.edit).toBe(false);
  });

  it("two system administrators can't deactivate each other at once and leave none", async () => {
    await User.updateMany({ role: "system_admin" }, { $set: { isActive: false } });
    const a = await createUser({ role: "system_admin" });
    const b = await createUser({ role: "system_admin" });
    const [asA, asB] = [as(await signInAs(t, a)), as(await signInAs(t, b))];
    const results = await Promise.all([
      asA.post(`/users/${b._id}/deactivate`, { reason: "Leaving the IT unit" }),
      asB.post(`/users/${a._id}/deactivate`, { reason: "Leaving the IT unit" }),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await User.countDocuments({ role: "system_admin", isActive: true })).toBe(1);
  });
});

describe("station OIC", () => {
  it("manages traffic officers and clerks at their own station only", async () => {
    const oic = await createUser({ role: "station_oic", stationId: kandy._id });
    const me = as(await signInAs(t, oic));
    const ok = await me.post(
      "/users",
      newPerson({ role: "traffic_officer", stationId: String(kandy._id) }),
    );
    expect(ok.status).toBe(201);
    const elsewhere = await me.post(
      "/users",
      newPerson({ role: "station_clerk", stationId: String(galle._id) }),
    );
    expect(elsewhere.body.error.fields.stationId).toMatch(/own station/);
    const higher = await me.post(
      "/users",
      newPerson({ role: "station_oic", stationId: String(kandy._id) }),
    );
    expect(higher.body.error.fields.role).toBeTruthy();
  });

  it("sees only their station's staff; others look not found", async () => {
    const oic = await createUser({ role: "station_oic", stationId: kandy._id });
    const me = as(await signInAs(t, oic));
    const galleClerk = await createUser({ role: "station_clerk", stationId: galle._id });
    const list = await me.get("/users?pageSize=100");
    expect(list.body.items.every((/** @type {any} */ u) => u.station?.name === "Kandy")).toBe(true);
    expect((await me.get(`/users/${galleClerk._id}`)).status).toBe(404);
    expect((await me.post(`/users/${galleClerk._id}/reset-password`)).status).toBe(404);
  });

  it("only gets their own station in the choices", async () => {
    const oic = await createUser({ role: "station_oic", stationId: kandy._id });
    const opts = await as(await signInAs(t, oic)).get("/users/options");
    expect(opts.body.roles.map((/** @type {any} */ r) => r.key).sort()).toEqual([
      "station_clerk",
      "traffic_officer",
    ]);
    expect(opts.body.stations.map((/** @type {any} */ s) => s.name)).toEqual(["Kandy"]);
  });
});

describe("view-only roles", () => {
  it("the division supervisor sees their division's staff but can't manage them", async () => {
    const ds = await createUser({ role: "division_supervisor", divisionId: kandyDivision._id });
    const me = as(await signInAs(t, ds));
    const kandyOfficer = await createUser({ role: "traffic_officer", stationId: kandy._id });
    const galleOfficer = await createUser({ role: "traffic_officer", stationId: galle._id });
    expect((await me.get(`/users/${kandyOfficer._id}`)).status).toBe(200);
    expect((await me.get(`/users/${galleOfficer._id}`)).status).toBe(404);
    expect((await me.post(`/users/${kandyOfficer._id}/reset-password`)).status).toBe(403);
  });

  it("the auditor reads every account and changes none", async () => {
    const me = as(await signInAs(t, await createUser({ role: "auditor" })));
    expect((await me.get("/users")).status).toBe(200);
    expect(
      (await me.post("/users", newPerson({ role: "station_clerk", stationId: String(kandy._id) })))
        .status,
    ).toBe(403);
  });

  it("traffic officers can't see accounts at all", async () => {
    const me = as(
      await signInAs(t, await createUser({ role: "traffic_officer", stationId: kandy._id })),
    );
    expect((await me.get("/users")).status).toBe(403);
  });
});

describe("audit", () => {
  it("every change is in an unbroken audit chain", async () => {
    expect(await verifyAuditChain()).toBeNull();
  });
});

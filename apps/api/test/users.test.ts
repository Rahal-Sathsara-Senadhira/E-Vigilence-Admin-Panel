// Accounts and permissions — docs/01 §4–7 (P1–P5, S5, S6, D01-2).

import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { PATH_METADATA } from "@nestjs/common/constants";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PERMISSION_KEY, PUBLIC_KEY, SIGNED_IN_KEY } from "../src/modules/auth/auth.decorators";
import {
  bearer,
  createStaff,
  createStation,
  createTestApp,
  signIn,
  type Staff,
  type TestApp,
} from "./helpers";

let t: TestApp;
let colombo: string;
let kandy: string;
let hq: Staff;
let dev: Staff;
let hqToken: string;
let devToken: string;

const newUser = (overrides: Record<string, unknown> = {}) => ({
  name: "Nimal Perera",
  email: `nimal.${Math.random().toString(36).slice(2, 8)}@police.test`,
  nic: `1985${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
  role: "station_officer",
  ...overrides,
});

beforeAll(async () => {
  t = await createTestApp();
  colombo = await createStation(t, "Colombo Fort");
  kandy = await createStation(t, "Kandy");
  hq = await createStaff(t, { role: "hq" });
  dev = await createStaff(t, { role: "dev" });
  hqToken = (await signIn(t, hq)).token;
  devToken = (await signIn(t, dev)).token;
});
afterAll(() => t.close());

describe("deny by default", () => {
  it("every endpoint declares an access rule", () => {
    const discovery = t.app.get(DiscoveryService);
    const scanner = t.app.get(MetadataScanner);
    const reflector = t.app.get(Reflector);
    const missing: string[] = [];

    for (const wrapper of discovery.getControllers()) {
      const instance = wrapper.instance as object | undefined;
      if (!instance) continue;
      const proto = Object.getPrototypeOf(instance);
      for (const name of scanner.getAllMethodNames(proto)) {
        const handler = proto[name];
        if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue; // not a route
        const targets = [handler, wrapper.metatype as object];
        const declared = [PUBLIC_KEY, SIGNED_IN_KEY, PERMISSION_KEY].some(
          (key) => reflector.getAllAndOverride(key, targets as never) !== undefined,
        );
        if (!declared) missing.push(`${wrapper.name}.${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("refuses requests without a token", async () => {
    expect((await t.http().get("/api/v1/users")).status).toBe(401);
  });
});

describe("who can create which accounts (§7)", () => {
  it("HQ cannot create a dev account — closes P3 (privilege escalation)", async () => {
    const res = await t
      .http()
      .post("/api/v1/users")
      .set(bearer(hqToken))
      .send(newUser({ role: "dev" }));
    expect(res.status).toBe(403);
  });

  it("dev can create a dev account", async () => {
    const res = await t
      .http()
      .post("/api/v1/users")
      .set(bearer(devToken))
      .send(newUser({ role: "dev" }));
    expect(res.status).toBe(201);
    expect(res.body.temporaryPassword).toMatch(/^[\w]{4}-[\w]{4}-[\w]{4}-[\w]{4}$/);
    expect(res.body.user.nicMasked).toMatch(/^\*+\d{4}$/);
  });

  it("a new account must change its temporary password", async () => {
    const res = await t
      .http()
      .post("/api/v1/users")
      .set(bearer(hqToken))
      .send(newUser({ stationId: colombo }));
    const login = await t
      .http()
      .post("/api/v1/auth/login")
      .send({ email: res.body.user.email, password: res.body.temporaryPassword });
    expect(login.body.session.user.mustChangePassword).toBe(true);
  });

  it("station roles need a station; email and NIC are unique", async () => {
    const noStation = await t.http().post("/api/v1/users").set(bearer(hqToken)).send(newUser());
    expect(noStation.status).toBe(400);
    expect(noStation.body.error.fields.stationId).toBeDefined();

    const first = newUser({ stationId: colombo });
    expect((await t.http().post("/api/v1/users").set(bearer(hqToken)).send(first)).status).toBe(
      201,
    );
    const sameEmail = await t
      .http()
      .post("/api/v1/users")
      .set(bearer(hqToken))
      .send({ ...newUser({ stationId: colombo }), email: first.email });
    expect(sameEmail.body.error.code).toBe("email_taken");
    const sameNic = await t
      .http()
      .post("/api/v1/users")
      .set(bearer(hqToken))
      .send({ ...newUser({ stationId: colombo }), nic: first.nic });
    expect(sameNic.body.error.code).toBe("nic_taken");
  });

  it("an OIC adds officers to their own station only, and can't create OICs", async () => {
    const oic = await createStaff(t, { role: "station_oic", stationId: colombo });
    const token = (await signIn(t, oic)).token;

    const own = await t
      .http()
      .post("/api/v1/users")
      .set(bearer(token))
      .send(newUser({ stationId: colombo }));
    expect(own.status).toBe(201);
    const implicit = await t
      .http()
      .post("/api/v1/users")
      .set(bearer(token))
      .send(newUser({ stationId: undefined, role: "station_officer" }));
    expect(implicit.status).toBe(400); // schema still requires a station for station roles

    const other = await t
      .http()
      .post("/api/v1/users")
      .set(bearer(token))
      .send(newUser({ stationId: kandy }));
    expect(other.status).toBe(403);
    const anotherOic = await t
      .http()
      .post("/api/v1/users")
      .set(bearer(token))
      .send(newUser({ role: "station_oic", stationId: colombo }));
    expect(anotherOic.status).toBe(403);
  });

  it("officers can't see or manage accounts", async () => {
    const officer = await createStaff(t, { role: "station_officer", stationId: colombo });
    const token = (await signIn(t, officer)).token;
    expect((await t.http().get("/api/v1/users").set(bearer(token))).status).toBe(403);
    expect(
      (
        await t
          .http()
          .post("/api/v1/users")
          .set(bearer(token))
          .send(newUser({ stationId: colombo }))
      ).status,
    ).toBe(403);
  });
});

describe("scope", () => {
  it("an OIC sees only their own station's accounts", async () => {
    const oic = await createStaff(t, { role: "station_oic", stationId: kandy });
    await createStaff(t, { role: "station_officer", stationId: colombo });
    const token = (await signIn(t, oic)).token;
    const res = await t.http().get("/api/v1/users?pageSize=100").set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((u: { stationId: string }) => u.stationId === kandy)).toBe(true);
  });

  it("a station user sees only their own station in the station list", async () => {
    const officer = await createStaff(t, { role: "station_officer", stationId: kandy });
    const token = (await signIn(t, officer)).token;
    const res = await t.http().get("/api/v1/stations").set(bearer(token));
    expect(res.body.map((s: { id: string }) => s.id)).toEqual([kandy]);
  });
});

describe("separation of duties and safety rules (§5)", () => {
  it("nobody can change their own account — S5", async () => {
    const res = await t
      .http()
      .post(`/api/v1/users/${hq.id}/deactivate`)
      .set(bearer(hqToken))
      .send({ reason: "Testing self" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("self_administration");
  });

  it("the last active HQ account can't be deactivated — S6", async () => {
    // `hq` is the only HQ account in this database; dev tries to remove it.
    const res = await t
      .http()
      .post(`/api/v1/users/${hq.id}/deactivate`)
      .set(bearer(devToken))
      .send({ reason: "Testing last admin" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("last_administrator");
  });

  it("only HQ/dev change roles, and it needs a reason", async () => {
    const officer = await createStaff(t, { role: "station_officer", stationId: colombo });
    const oic = await createStaff(t, { role: "station_oic", stationId: colombo });
    const oicToken = (await signIn(t, oic)).token;

    const byOic = await t
      .http()
      .post(`/api/v1/users/${officer.id}/role`)
      .set(bearer(oicToken))
      .send({ role: "station_oic", stationId: colombo, reason: "Promotion" });
    expect(byOic.status).toBe(403);
    const noReason = await t
      .http()
      .post(`/api/v1/users/${officer.id}/role`)
      .set(bearer(hqToken))
      .send({ role: "station_oic", stationId: colombo });
    expect(noReason.status).toBe(400);
  });

  it("appointing an OIC makes the previous OIC an officer — one OIC per station (D01-2)", async () => {
    const station = await createStation(t, "Galle");
    const oldOic = await createStaff(t, { role: "station_oic", stationId: station });
    const officer = await createStaff(t, { role: "station_officer", stationId: station });
    const oldOicSession = await signIn(t, oldOic);

    const res = await t
      .http()
      .post(`/api/v1/users/${officer.id}/role`)
      .set(bearer(hqToken))
      .send({ role: "station_oic", stationId: station, reason: "New OIC appointed by HQ" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("station_oic");

    const before = await t.users.findById(oldOic.id).lean();
    expect(before!.role).toBe("station_officer");
    const oics = await t.users.countDocuments({
      stationId: before!.stationId,
      role: "station_oic",
      active: true,
    });
    expect(oics).toBe(1);

    // The demoted OIC's sessions ended, so their old powers end now.
    expect((await t.http().get("/api/v1/auth/me").set(bearer(oldOicSession.token))).status).toBe(
      401,
    );
  });

  it("deactivation ends the user's sessions immediately", async () => {
    const officer = await createStaff(t, { role: "station_officer", stationId: colombo });
    const s = await signIn(t, officer);
    const res = await t
      .http()
      .post(`/api/v1/users/${officer.id}/deactivate`)
      .set(bearer(hqToken))
      .send({ reason: "Left the service" });
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    expect((await t.http().get("/api/v1/auth/me").set(bearer(s.token))).status).toBe(401);
  });

  it("dev has no case authority, only technical administration (P1, D01-4)", async () => {
    const health = await t.http().get("/api/v1/system/health").set(bearer(devToken));
    expect(health.status).toBe(200);
    const hqHealth = await t.http().get("/api/v1/system/health").set(bearer(hqToken));
    expect(hqHealth.status).toBe(403);
  });
});

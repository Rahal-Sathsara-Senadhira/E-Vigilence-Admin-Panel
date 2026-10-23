// Divisions and police stations — docs/03 §3, docs/20 §5.4.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifyAuditChain } from "#src/core/audit/audit.js";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { Division, Station } from "#src/modules/organisation/organisation.model.js";
import { CSRF, createTestApp, createUser, signInAs } from "./helpers/app.js";

/** @type {Awaited<ReturnType<typeof createTestApp>>} */
let t;
/** @type {any} */ let kandyDiv;
/** @type {any} */ let galleDiv;
/** @type {any} */ let kandy;
/** @type {any} */ let galle;
/** @type {any} */ let imported;
/** @type {ReturnType<typeof as>} */ let hq;

/** @param {string} token */
const as = (token) => ({
  get: (/** @type {string} */ p) =>
    t.http().get(`/api/v1${p}`).set("Authorization", `Bearer ${token}`),
  post: (/** @type {string} */ p, /** @type {object} */ b = {}) =>
    t.http().post(`/api/v1${p}`).set(CSRF).set("Authorization", `Bearer ${token}`).send(b),
  put: (/** @type {string} */ p, /** @type {object} */ b) =>
    t.http().put(`/api/v1${p}`).set(CSRF).set("Authorization", `Bearer ${token}`).send(b),
});

/** A small square around a point, as a closed GeoJSON polygon. */
const square = (lat = 7.29, lng = 80.63, d = 0.02) => ({
  type: "Polygon",
  coordinates: [
    [
      [lng - d, lat - d],
      [lng + d, lat - d],
      [lng + d, lat + d],
      [lng - d, lat + d],
      [lng - d, lat - d],
    ],
  ],
});

beforeAll(async () => {
  t = await createTestApp();
  [kandyDiv, galleDiv] = await Division.create([
    { name: "Kandy", code: "KANDY" },
    { name: "Galle", code: "GALLE" },
  ]);
  [kandy, galle, imported] = await Station.create([
    {
      name: "Kandy Police Station",
      code: "KANDY",
      divisionId: kandyDiv._id,
      verified: true,
      location: { type: "Point", coordinates: [80.633, 7.29] },
    },
    {
      name: "Galle Police Station",
      code: "GALLE",
      divisionId: galleDiv._id,
      verified: true,
      location: { type: "Point", coordinates: [80.221, 6.053] },
    },
    {
      name: "Peradeniya Police Station",
      code: "PERADENIYA",
      suggestedDivisionId: kandyDiv._id,
      source: "osm",
      osmId: "node/1",
      location: { type: "Point", coordinates: [80.6, 7.27] },
    },
  ]);
  hq = as(await signInAs(t, await createUser({ role: "hq_admin" })));
});
afterAll(() => t.close());
beforeEach(() => signInLimiter.reset());

describe("HQ administrator", () => {
  it("lists stations with the unverified count and a suggested division", async () => {
    const res = await hq.get("/stations?status=unverified");
    expect(res.body.unverified).toBe(1);
    expect(res.body.items[0]).toMatchObject({
      name: "Peradeniya Police Station",
      status: "unverified",
      division: null,
      suggestedDivision: { name: "Kandy" },
    });
  });

  it("verifies an imported station by confirming its division and position", async () => {
    const res = await hq.post(`/stations/${imported._id}/verify`, {
      divisionId: String(kandyDiv._id),
      lat: 7.271,
      lng: 80.598,
    });
    expect(res.body).toMatchObject({
      status: "verified",
      division: { name: "Kandy" },
      location: { lat: 7.271, lng: 80.598 },
    });
    expect(res.body.verifiedBy).toBeTruthy();
    expect(
      (
        await hq.post(`/stations/${imported._id}/verify`, {
          divisionId: String(kandyDiv._id),
          lat: 7.27,
          lng: 80.6,
        })
      ).status,
    ).toBe(409);
  });

  it("adds a station, verified at once, with a code made from its name", async () => {
    const res = await hq.post("/stations", {
      name: "Mt. Lavinia Police Station",
      divisionId: String(galleDiv._id),
      lat: 6.83,
      lng: 79.865,
      phone: "011 271 2222",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ code: "MT-LAVINIA", status: "verified" });
  });

  it("refuses positions outside Sri Lanka", async () => {
    const res = await hq.post("/stations", {
      name: "Somewhere Police Station",
      divisionId: String(galleDiv._id),
      lat: 51.5,
      lng: -0.12,
    });
    expect(res.body.error.fields).toMatchObject({
      lat: expect.stringMatching(/outside Sri Lanka/),
    });
  });

  it("sets an area from GeoJSON, and refuses broken shapes", async () => {
    const ok = await hq.put(`/stations/${kandy._id}/area`, {
      area: { type: "Feature", properties: {}, geometry: square() },
    });
    expect(ok.body.hasArea).toBe(true);
    const open = square();
    open.coordinates[0].pop();
    expect(
      (await hq.put(`/stations/${kandy._id}/area`, { area: open })).body.error.fields.area,
    ).toMatch(/end where it starts/);
    expect(
      (await hq.put(`/stations/${kandy._id}/area`, { area: square(51.5, -0.1) })).body.error.fields
        .area,
    ).toMatch(/within Sri Lanka/);
    const bowtie = {
      type: "Polygon",
      coordinates: [
        [
          [80.6, 7.2],
          [80.7, 7.3],
          [80.7, 7.2],
          [80.6, 7.3],
          [80.6, 7.2],
        ],
      ],
    };
    expect(
      (await hq.put(`/stations/${kandy._id}/area`, { area: bowtie })).body.error.fields.area,
    ).toMatch(/crosses itself/);
    expect((await hq.put(`/stations/${kandy._id}/area`, { area: null })).body.hasArea).toBe(false);
  });

  it("won't deactivate a station that still has staff", async () => {
    const [empty] = await Station.create([
      { name: "Empty Police Station", code: "EMPTY", divisionId: galleDiv._id, verified: true },
    ]);
    await createUser({ role: "traffic_officer", stationId: galle._id });
    const busy = await hq.post(`/stations/${galle._id}/deactivate`, {
      reason: "Merged with another station",
    });
    expect(busy.body.error.code).toBe("has_staff");
    const done = await hq.post(`/stations/${empty?._id}/deactivate`, {
      reason: "Merged with another station",
    });
    expect(done.body.status).toBe("inactive");
    expect((await hq.post(`/stations/${empty?._id}/reactivate`)).body.status).toBe("verified");
  });

  it("creates and renames divisions, with unique names and codes", async () => {
    const created = await hq.post("/divisions", { name: "Ella", code: "ella", province: "Uva" });
    expect(created.body).toMatchObject({ name: "Ella", code: "ELLA" });
    const dup = await hq.post("/divisions", { name: "Ella", code: "ELLA2" });
    expect(dup.body.error.fields.name).toBeTruthy();
    const renamed = await hq.put(`/divisions/${created.body.id}`, {
      name: "Ella North",
      code: "ELLA",
      province: "Uva",
    });
    expect(renamed.body.name).toBe("Ella North");
  });
});

describe("station roles", () => {
  it("an OIC sees and edits the contact details of their own station only", async () => {
    const oic = as(
      await signInAs(t, await createUser({ role: "station_oic", stationId: kandy._id })),
    );
    const list = await oic.get("/stations");
    expect(list.body.items.map((/** @type {any} */ s) => s.name)).toEqual(["Kandy Police Station"]);
    const own = await oic.get(`/stations/${kandy._id}`);
    expect(own.body.can).toMatchObject({ edit: false, editContact: true, verify: false });
    expect(
      own.body.staff.find((/** @type {any} */ s) => s.role === "station_oic")?.count,
    ).toBeGreaterThan(0);
    expect((await oic.get(`/stations/${galle._id}`)).status).toBe(404);
    const contact = await oic.put(`/stations/${kandy._id}/contact`, {
      phone: "081 222 2222",
      address: "Dalada Veediya, Kandy",
    });
    expect(contact.body).toMatchObject({ phone: "081 222 2222", address: "Dalada Veediya, Kandy" });
    expect(
      (await oic.put(`/stations/${galle._id}/contact`, { phone: "091 222 2222" })).status,
    ).toBe(404);
    expect(
      (
        await oic.put(`/stations/${kandy._id}`, {
          name: "x",
          divisionId: String(kandyDiv._id),
          lat: 7,
          lng: 80,
        })
      ).status,
    ).toBe(403);
  });

  it("a traffic officer can view their station but not edit it", async () => {
    const officer = as(
      await signInAs(t, await createUser({ role: "traffic_officer", stationId: kandy._id })),
    );
    expect((await officer.get(`/stations/${kandy._id}`)).body.can.editContact).toBe(false);
    expect(
      (await officer.put(`/stations/${kandy._id}/contact`, { phone: "081 333 3333" })).status,
    ).toBe(403);
  });

  it("a division supervisor sees their division's stations and can edit their contacts", async () => {
    const ds = as(
      await signInAs(
        t,
        await createUser({ role: "division_supervisor", divisionId: kandyDiv._id }),
      ),
    );
    const names = (await ds.get("/stations?pageSize=100")).body.items.map(
      (/** @type {any} */ s) => s.name,
    );
    expect(names).toContain("Kandy Police Station");
    expect(names).not.toContain("Galle Police Station");
    expect(
      (await ds.put(`/stations/${kandy._id}/contact`, { email: "kandy.police@police.lk" })).body
        .email,
    ).toBe("kandy.police@police.lk");
    expect((await ds.get(`/stations/${galle._id}`)).status).toBe(404);
  });

  it("the auditor reads everything and changes nothing", async () => {
    const aud = as(await signInAs(t, await createUser({ role: "auditor" })));
    expect((await aud.get(`/stations/${galle._id}`)).status).toBe(200);
    expect((await aud.post("/divisions", { name: "X", code: "X1" })).status).toBe(403);
  });
});

describe("audit", () => {
  it("records every change in an unbroken chain", async () => {
    expect(await verifyAuditChain()).toBeNull();
  });
});

describe("audit log, scoped by area", () => {
  it("an OIC sees only entries about their station; HQ sees all and checks the chain", async () => {
    const oicUser = await createUser({ role: "station_oic", stationId: kandy._id });
    const oic = as(await signInAs(t, oicUser));
    await oic.put(`/stations/${kandy._id}/contact`, { phone: "081 444 4444" });
    // HQ edits stations through the full edit, not the contact-only route.
    await hq.put(`/stations/${galle._id}`, {
      name: "Galle Police Station",
      divisionId: String(galleDiv._id),
      lat: 6.053,
      lng: 80.221,
      phone: "091 444 4444",
    });

    const mine = await oic.get("/audit?pageSize=100");
    expect(mine.status).toBe(200);
    const labels = mine.body.items.map((/** @type {any} */ e) => e.target?.label);
    expect(labels).toContain("Kandy Police Station");
    expect(labels).not.toContain("Galle Police Station");
    expect((await oic.get("/audit/integrity")).status).toBe(403);

    const all = await hq.get("/audit?category=stations&pageSize=100");
    expect(all.body.items.map((/** @type {any} */ e) => e.target?.label)).toContain(
      "Galle Police Station",
    );
    expect(all.body.items[0]).toMatchObject({
      category: "Stations",
      actor: { roleLabel: expect.any(String) },
    });
    expect((await hq.get("/audit/integrity")).body).toMatchObject({ ok: true, brokenAt: null });
  });

  it("traffic officers can't read the audit log", async () => {
    const officer = as(
      await signInAs(t, await createUser({ role: "traffic_officer", stationId: kandy._id })),
    );
    expect((await officer.get("/audit")).status).toBe(403);
  });
});

// Cases and dispatch — docs/03: which station gets a case, accept and
// return (and "disputed jurisdiction"), the investigating officer, work
// starting by itself, and who may see and write what.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifyAuditChain } from "#src/core/audit/audit.js";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { Case } from "#src/modules/cases/index.js";
import { OffenceVersion } from "#src/modules/offences/offences.model.js";
import { Division, Station } from "#src/modules/organisation/organisation.model.js";
import { Report } from "#src/modules/reports/report.model.js";
import { User } from "#src/modules/users/user.model.js";
import { CSRF, createTestApp, createUser, signInAs } from "./helpers/app.js";

/** @type {Awaited<ReturnType<typeof createTestApp>>} */
let t;
/** @type {any} */ let kandy;
/** @type {any} */ let peradeniya;
/** @type {any} */ let galle;
/** @type {any} */ let unverified;
/** @type {any} */ let kandyOfficer;
/** @type {any} */ let kandyOfficer2;
/** @type {Record<string, ReturnType<typeof as>>} */
const u = {};

/** @param {string} token */
const as = (token) => ({
  get: (/** @type {string} */ p) =>
    t.http().get(`/api/v1${p}`).set("Authorization", `Bearer ${token}`),
  post: (/** @type {string} */ p, /** @type {object} */ b = {}) =>
    t.http().post(`/api/v1${p}`).set(CSRF).set("Authorization", `Bearer ${token}`).send(b),
});

// Kandy's drawn area: a box around the town. Peradeniya just outside it, to the west.
const KANDY_AREA = {
  type: "Polygon",
  coordinates: [
    [
      [80.6, 7.26],
      [80.67, 7.26],
      [80.67, 7.32],
      [80.6, 7.32],
      [80.6, 7.26],
    ],
  ],
};
const IN_KANDY = { lat: 7.2936, lng: 80.6413 };
const NEAR_PERADENIYA = { lat: 7.26, lng: 80.585 };

/**
 * A report recorded and accepted at HQ; returns the case.
 * @param {{ lat?: number, lng?: number, priority?: string }} [place]
 */
async function caseFrom(place = IN_KANDY) {
  const occurredAt = new Date(Date.now() - 3_600_000).toISOString();
  const r = await u.hq?.post("/reports", {
    channel: "whatsapp",
    reporter: { kind: "named", name: "Saman Kumara", phone: "0771234567" },
    occurredAt,
    ...(place.lat !== undefined ? { lat: place.lat, lng: place.lng } : {}),
    address: "Somewhere in Kandy",
    vehicleNumber: "CP CAB-1234",
    offenceCodes: ["MTA-157A"],
    description: "Driver without a seat belt near the temple.",
  });
  const accepted = await u.hq?.post(`/reports/${r?.body.id}/accept`, {
    offenceCodes: ["MTA-157A"],
    vehicleNumber: "CP CAB-1234",
    priority: place.priority ?? "P2",
    occurredAt,
    ...(place.lat !== undefined ? { lat: place.lat, lng: place.lng } : {}),
    address: "Somewhere in Kandy",
  });
  expect(accepted?.status).toBe(200);
  return { caseId: accepted?.body.case.id, reportId: r?.body.id };
}

beforeAll(async () => {
  t = await createTestApp();
  await OffenceVersion.create({
    code: "MTA-157A",
    version: 1,
    name: "Seat belt",
    legalReference: "s. 157A",
    outcome: "spot_fine",
    spotFine: 1000,
    severity: "minor",
    citizenReportable: true,
    publicName: "No seat belt",
    publicDescription: "Seat belt not worn.",
    active: true,
    effectiveFrom: new Date(Date.now() - 86_400_000),
    current: true,
    source: "test",
    changedBy: "test",
    reason: "test",
  });
  const [div] = await Division.create([{ name: "Kandy", code: "KANDY" }]);
  [kandy, peradeniya, galle, unverified] = await Station.create(
    /** @type {any[]} */ ([
      {
        name: "Kandy Police Station",
        code: "KDY",
        divisionId: div?._id,
        verified: true,
        location: { type: "Point", coordinates: [80.6337, 7.2906] },
        area: KANDY_AREA,
      },
      {
        name: "Peradeniya Police Station",
        code: "PRD",
        divisionId: div?._id,
        verified: true,
        location: { type: "Point", coordinates: [80.5953, 7.2675] },
      },
      {
        name: "Galle Police Station",
        code: "GLE",
        verified: true,
        location: { type: "Point", coordinates: [80.217, 6.0328] },
      },
      {
        // Right at the Peradeniya point, but never chosen automatically.
        name: "Unverified Station",
        code: "UNV",
        verified: false,
        location: { type: "Point", coordinates: [80.585, 7.26] },
      },
    ]),
  );
  kandyOfficer = await createUser({ role: "traffic_officer", stationId: kandy._id });
  kandyOfficer2 = await createUser({ role: "traffic_officer", stationId: kandy._id });
  const accounts = {
    hq: await createUser({ role: "hq_operator" }),
    supervisor: await createUser({ role: "hq_supervisor" }),
    kandyOic: await createUser({ role: "station_oic", stationId: kandy._id }),
    kandyClerk: await createUser({ role: "station_clerk", stationId: kandy._id }),
    kandyOfficer,
    kandyOfficer2,
    peradeniyaOic: await createUser({ role: "station_oic", stationId: peradeniya._id }),
    peradeniyaOfficer: await createUser({ role: "traffic_officer", stationId: peradeniya._id }),
    galleOfficer: await createUser({ role: "traffic_officer", stationId: galle._id }),
    divisionSupervisor: await createUser({ role: "division_supervisor", divisionId: div?._id }),
  };
  for (const [key, user] of Object.entries(accounts)) u[key] = as(await signInAs(t, user));
});
afterAll(() => t.close());
beforeEach(() => signInLimiter.reset());

describe("dispatch", () => {
  it("sends a case to the station whose area contains the place, with its deadlines", async () => {
    const { caseId, reportId } = await caseFrom(IN_KANDY);
    const res = await u.hq?.get(`/cases/${caseId}`);
    expect(res?.body).toMatchObject({
      status: "dispatched",
      station: { id: String(kandy._id), name: "Kandy Police Station" },
      dispatches: [{ method: "jurisdiction", by: "Automatic dispatch", endedAt: null }],
      deadline: { kind: "accept" },
    });
    // P2: 24 hours to accept.
    const hours = (Date.parse(res?.body.deadline.at) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    // The report goes with the case: Kandy's staff can read it now.
    expect((await u.kandyClerk?.get(`/reports/${reportId}`))?.status).toBe(200);
  });

  it("a P1 case must be accepted within 2 hours", async () => {
    const { caseId } = await caseFrom({ ...IN_KANDY, priority: "P1" });
    const c = (await u.hq?.get(`/cases/${caseId}`))?.body;
    const hours = (Date.parse(c.deadline.at) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(1.9);
    expect(hours).toBeLessThanOrEqual(2);
  });

  it("outside every area, the nearest verified station — never an unverified one", async () => {
    const { caseId } = await caseFrom(NEAR_PERADENIYA);
    const c = (await u.hq?.get(`/cases/${caseId}`))?.body;
    expect(c).toMatchObject({
      station: { id: String(peradeniya._id) },
      dispatches: [{ method: "nearest", distanceKm: expect.any(Number) }],
    });
    expect(c.dispatches[0].distanceKm).toBeLessThan(3);
  });

  it("without a map position the case waits for HQ, who chooses with a reason", async () => {
    const { caseId } = await caseFrom({});
    const waiting = await u.hq?.get("/cases?view=not_dispatched");
    expect(waiting?.body.items.map((/** @type {any} */ c) => c.id)).toContain(caseId);
    expect((await u.hq?.post(`/cases/${caseId}/dispatch`, { mode: "auto" }))?.status).toBe(409);
    expect(
      (
        await u.hq?.post(`/cases/${caseId}/dispatch`, {
          mode: "manual",
          stationId: String(kandy._id),
        })
      )?.status,
    ).toBe(400);
    const res = await u.hq?.post(`/cases/${caseId}/dispatch`, {
      mode: "manual",
      stationId: String(unverified._id),
      reason: "Caller said it happened next to this station.",
    });
    expect(res?.status).toBe(200);
    expect(res?.body.dispatches.at(-1)).toMatchObject({
      method: "manual",
      warnings: expect.arrayContaining(["unverified_station", "no_active_officers"]),
    });
  });

  it("offers HQ the stations nearest the case first, searchable by name", async () => {
    const { caseId } = await caseFrom(NEAR_PERADENIYA);
    const res = await u.hq?.get(`/cases/${caseId}/stations`);
    const names = res?.body.items.map((/** @type {any} */ s) => s.name);
    expect(names.indexOf("Galle Police Station")).toBe(names.length - 1);
    expect(res?.body.items[0]).toMatchObject({ distanceKm: expect.any(Number) });
    const found = await u.hq?.get(`/cases/${caseId}/stations?q=gall`);
    expect(found?.body.items.map((/** @type {any} */ s) => s.name)).toEqual([
      "Galle Police Station",
    ]);
    expect((await u.kandyOic?.get(`/cases/${caseId}/stations`))?.status).toBe(403);
  });

  it("only HQ dispatches", async () => {
    const { caseId } = await caseFrom(IN_KANDY);
    const res = await u.kandyOic?.post(`/cases/${caseId}/dispatch`, { mode: "auto" });
    expect(res?.status).toBe(403);
  });
});

describe("at the station", () => {
  it("an officer accepts and becomes the investigating officer; other stations can't", async () => {
    const { caseId } = await caseFrom(IN_KANDY);
    expect((await u.galleOfficer?.post(`/cases/${caseId}/accept`))?.status).toBe(404);
    expect((await u.kandyClerk?.post(`/cases/${caseId}/accept`))?.status).toBe(403);
    const toAccept = await u.kandyOfficer?.get("/cases?view=to_accept");
    expect(toAccept?.body.items.map((/** @type {any} */ c) => c.id)).toContain(caseId);

    const res = await u.kandyOfficer?.post(`/cases/${caseId}/accept`);
    expect(res?.body).toMatchObject({
      status: "accepted",
      officer: { name: kandyOfficer.name, active: true },
      deadline: { kind: "start_work" },
    });
    expect((await u.kandyOfficer?.post(`/cases/${caseId}/accept`))?.status).toBe(409);
    const mine = await u.kandyOfficer?.get("/cases?view=mine");
    expect(mine?.body.items.map((/** @type {any} */ c) => c.id)).toContain(caseId);
  });

  it("the first note by the officer starts the work; then the case can't be returned", async () => {
    const { caseId } = await caseFrom(IN_KANDY);
    await u.kandyOfficer?.post(`/cases/${caseId}/accept`);
    // Other officers at the station read only (D03-8).
    expect(
      (await u.kandyOfficer2?.post(`/cases/${caseId}/notes`, { text: "I saw this car too." }))
        ?.status,
    ).toBe(403);
    const res = await u.kandyOfficer?.post(`/cases/${caseId}/notes`, {
      text: "Called the registry about the plate.",
    });
    expect(res?.body).toMatchObject({
      status: "investigating",
      workStartedAt: expect.any(String),
      notes: [{ side: "station", text: "Called the registry about the plate." }],
      deadline: { kind: "recommend" },
    });
    const ret = await u.kandyOfficer?.post(`/cases/${caseId}/return`, {
      reason: "Actually this is not our area.",
    });
    expect(ret?.status).toBe(409);
    // HQ writes as HQ.
    const hqNote = await u.hq?.post(`/cases/${caseId}/notes`, { text: "Owner may live in Galle." });
    expect(hqNote?.body.notes.at(-1)).toMatchObject({ side: "hq" });
  });

  it("returned twice, a case is disputed: HQ must choose, and that choice can't be returned", async () => {
    const { caseId } = await caseFrom(IN_KANDY);
    expect((await u.kandyOic?.post(`/cases/${caseId}/return`, { reason: "short" }))?.status).toBe(
      400,
    );
    const first = await u.kandyOic?.post(`/cases/${caseId}/return`, {
      reason: "The junction is on Peradeniya's side of the road.",
    });
    expect(first?.body).toMatchObject({ status: "returned", station: null, disputed: false });
    // Gone from Kandy; HQ sees it in "returned".
    expect((await u.kandyOic?.get(`/cases/${caseId}`))?.status).toBe(404);
    const returned = await u.hq?.get("/cases?view=returned");
    expect(returned?.body.items.map((/** @type {any} */ c) => c.id)).toContain(caseId);

    // The automatic choice skips the station that returned it.
    const again = await u.hq?.post(`/cases/${caseId}/dispatch`, { mode: "auto" });
    expect(again?.body.station.id).toBe(String(peradeniya._id));
    const second = await u.peradeniyaOfficer?.post(`/cases/${caseId}/return`, {
      reason: "The place is inside Kandy's area on the map.",
    });
    expect(second?.body).toMatchObject({ status: "returned", disputed: true, returnCount: 2 });

    expect((await u.hq?.post(`/cases/${caseId}/dispatch`, { mode: "auto" }))?.status).toBe(409);
    const chosen = await u.hq?.post(`/cases/${caseId}/dispatch`, {
      mode: "manual",
      stationId: String(kandy._id),
      reason: "Checked the map: Kandy's area.",
    });
    expect(chosen?.body.dispatches.at(-1).warnings).toContain("disputed_jurisdiction");
    const third = await u.kandyOic?.post(`/cases/${caseId}/return`, {
      reason: "We still think it is not ours.",
    });
    expect(third?.status).toBe(409);
    expect(third?.body.error.message).toMatch(/Add a note to HQ/);
    expect(
      (await u.kandyOic?.post(`/cases/${caseId}/notes`, { text: "We disagree." }))?.status,
    ).toBe(200);
  });

  it("the OIC assigns an officer of the station, and a case whose officer left needs one", async () => {
    const { caseId } = await caseFrom(IN_KANDY);
    await u.kandyOfficer?.post(`/cases/${caseId}/accept`);
    const officers = await u.kandyOic?.get(`/cases/${caseId}/officers`);
    expect(officers?.body.items.map((/** @type {any} */ o) => o.name)).toContain(
      kandyOfficer2.name,
    );
    expect(
      (
        await u.kandyOic?.post(`/cases/${caseId}/officer`, {
          officerId: String(
            (await User.findOne({ role: "traffic_officer", stationId: galle._id }))?._id,
          ),
        })
      )?.status,
    ).toBe(400);
    expect(
      (await u.kandyOfficer?.post(`/cases/${caseId}/officer`, { officerId: "x" }))?.status,
    ).toBe(403);
    const res = await u.kandyOic?.post(`/cases/${caseId}/officer`, {
      officerId: String(kandyOfficer2._id),
      note: "Officer 1 is on leave.",
    });
    expect(res?.body.officer).toMatchObject({ name: kandyOfficer2.name, active: true });

    // The officer is deactivated: the case shows up as needing an officer.
    await User.updateOne({ _id: kandyOfficer2._id }, { $set: { isActive: false } });
    const needs = await u.kandyOic?.get("/cases?view=needs_officer");
    expect(needs?.body.items.map((/** @type {any} */ c) => c.id)).toContain(caseId);
    expect((await u.kandyOic?.get(`/cases/${caseId}`))?.body.officer.active).toBe(false);
    await User.updateOne({ _id: kandyOfficer2._id }, { $set: { isActive: true } });
  });

  it("a clerk's walk-in case waits for an officer; an officer's is theirs", async () => {
    const report = {
      channel: "walk_in",
      reporter: { kind: "named", name: "Nimal Perera", phone: "0712345678" },
      occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
      address: "Dalada Veediya, Kandy",
      vehicleNumber: "CP CAR-4804",
      offenceCodes: ["MTA-157A"],
      description: "Driver without a seat belt near the temple.",
    };
    const byClerk = await u.kandyClerk?.post("/reports", report);
    const clerkCase = (await u.kandyOic?.get(`/cases/${byClerk?.body.case.id}`))?.body;
    expect(clerkCase).toMatchObject({
      status: "accepted",
      officer: null,
      deadline: { kind: "assign_officer" },
      can: { assignOfficer: true, return: false },
    });
    // The station recorded it: it is theirs, not HQ's to take back.
    const back = await u.kandyOic?.post(`/cases/${clerkCase.id}/return`, {
      reason: "We would rather HQ handled this one.",
    });
    expect(back?.status).toBe(409);
    const needs = await u.kandyOic?.get("/cases?view=needs_officer");
    expect(needs?.body.items.map((/** @type {any} */ c) => c.id)).toContain(clerkCase.id);

    const byOfficer = await u.kandyOfficer?.post("/reports", { ...report, channel: "phone" });
    expect((await u.kandyOic?.get(`/cases/${byOfficer?.body.case.id}`))?.body.officer.name).toBe(
      kandyOfficer.name,
    );
  });
});

describe("moving and scope", () => {
  it("HQ re-dispatches a case being worked; the officer is cleared and the reports follow", async () => {
    const { caseId, reportId } = await caseFrom(IN_KANDY);
    await u.kandyOfficer?.post(`/cases/${caseId}/accept`);
    await u.kandyOfficer?.post(`/cases/${caseId}/notes`, { text: "Started looking." });
    const res = await u.hq?.post(`/cases/${caseId}/dispatch`, {
      mode: "manual",
      stationId: String(galle._id),
      reason: "The owner and driver are in Galle.",
    });
    expect(res?.body).toMatchObject({
      status: "dispatched",
      officer: null,
      station: { id: String(galle._id) },
    });
    expect(res?.body.dispatches.at(-2)).toMatchObject({
      endReason: "redispatched",
      endedAt: expect.any(String),
    });
    expect((await Report.findById(reportId).lean())?.stationId).toEqual(galle._id);
    expect((await u.galleOfficer?.get(`/reports/${reportId}`))?.status).toBe(200);
    expect((await u.kandyOfficer?.get(`/cases/${caseId}`))?.status).toBe(404);
  });

  it("a division supervisor sees the division's cases; a station sees its own", async () => {
    const { caseId } = await caseFrom(NEAR_PERADENIYA);
    expect((await u.divisionSupervisor?.get(`/cases/${caseId}`))?.status).toBe(200);
    expect((await u.kandyOic?.get(`/cases/${caseId}`))?.status).toBe(404);
    expect((await u.galleOfficer?.get(`/cases/${caseId}`))?.status).toBe(404);
  });

  it("a station with cases being worked can't be deactivated", async () => {
    await Case.updateMany({ stationId: peradeniya._id }, { $set: { status: "dispatched" } });
    const sysadmin = as(await signInAs(t, await createUser({ role: "hq_admin" })));
    await User.updateMany({ stationId: peradeniya._id }, { $set: { isActive: false } });
    const res = await sysadmin.post(`/stations/${peradeniya._id}/deactivate`, {
      reason: "Station merged into Kandy.",
    });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/Re-dispatch/);
    await User.updateMany({ stationId: peradeniya._id }, { $set: { isActive: true } });
  });

  it("keeps the audit chain intact", async () => {
    expect(await verifyAuditChain()).toBeNull();
  });
});

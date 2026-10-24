// Investigation — docs/04: the person and vehicle registers, the vehicle
// trace (owner on the offence date, re-check after 6 months), driver,
// evidence review, statements, case evidence; who may see people.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditEntry, verifyAuditChain } from "#src/core/audit/audit.js";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { OffenceVersion } from "#src/modules/offences/offences.model.js";
import { Station } from "#src/modules/organisation/organisation.model.js";
import { Vehicle } from "#src/modules/registers/registers.model.js";
import { CSRF, createTestApp, createUser, signInAs } from "./helpers/app.js";

/** @type {Awaited<ReturnType<typeof createTestApp>>} */
let t;
/** @type {any} */ let kandy;
/** @type {any} */ let galle;
/** @type {Record<string, ReturnType<typeof as>>} */
const u = {};
/** @type {Record<string, string>} */
const tokens = {};
const DAY = 86_400_000;

/** @param {string} token */
const as = (token) => ({
  get: (/** @type {string} */ p) =>
    t.http().get(`/api/v1${p}`).set("Authorization", `Bearer ${token}`),
  post: (/** @type {string} */ p, /** @type {object} */ b = {}) =>
    t.http().post(`/api/v1${p}`).set(CSRF).set("Authorization", `Bearer ${token}`).send(b),
  put: (/** @type {string} */ p, /** @type {object} */ b = {}) =>
    t.http().put(`/api/v1${p}`).set(CSRF).set("Authorization", `Bearer ${token}`).send(b),
  patch: (/** @type {string} */ p, /** @type {object} */ b = {}) =>
    t.http().patch(`/api/v1${p}`).set(CSRF).set("Authorization", `Bearer ${token}`).send(b),
});

const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(2048, 5),
  Buffer.from([0xff, 0xd9]),
]);

/**
 * A case at Kandy, accepted by the Kandy officer.
 * @param {{ plate?: string, occurredDaysAgo?: number }} [o]
 */
async function kandyCase(o = {}) {
  const occurredAt = new Date(
    Date.now() - (o.occurredDaysAgo ?? 0) * DAY - 3_600_000,
  ).toISOString();
  const plate = o.plate ?? "CP CAB-1234";
  const r = await u.hq?.post("/reports", {
    channel: "whatsapp",
    reporter: { kind: "named", name: "Saman Kumara", phone: "0771234567" },
    occurredAt,
    lat: 7.2936,
    lng: 80.6413,
    address: "Dalada Veediya, Kandy",
    vehicleNumber: plate,
    offenceCodes: ["MTA-157A"],
    description: "Driver without a seat belt near the temple.",
  });
  const accepted = await u.hq?.post(`/reports/${r?.body.id}/accept`, {
    offenceCodes: ["MTA-157A"],
    vehicleNumber: plate,
    priority: "P2",
    occurredAt,
    lat: 7.2936,
    lng: 80.6413,
  });
  const caseId = accepted?.body.case.id;
  expect((await u.officer?.post(`/cases/${caseId}/accept`))?.status).toBe(200);
  return /** @type {string} */ (caseId);
}

/** @param {object} body */
const newPerson = async (body) => {
  const res = await u.officer?.post("/persons", { type: "individual", ...body });
  expect(res?.status).toBe(201);
  return /** @type {string} */ (res?.body.id);
};

/** @param {string} caseId @param {string} ownerId @param {object} [extra] */
const trace = (caseId, ownerId, extra = {}) =>
  u.officer?.post(`/cases/${caseId}/trace`, {
    vehicleType: "car",
    make: "Toyota",
    model: "Axio",
    colour: "White",
    ownerId,
    ownerFrom: new Date(Date.now() - 700 * DAY).toISOString(),
    dmtReference: "DMT/KDY/2026/0042",
    checkedOn: new Date().toISOString(),
    ...extra,
  });

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
    effectiveFrom: new Date(Date.now() - DAY),
    current: true,
    source: "test",
    changedBy: "test",
    reason: "test",
  });
  [kandy, galle] = await Station.create(
    /** @type {any[]} */ ([
      {
        name: "Kandy Police Station",
        code: "KDY",
        verified: true,
        location: { type: "Point", coordinates: [80.6337, 7.2906] },
      },
      {
        name: "Galle Police Station",
        code: "GLE",
        verified: true,
        location: { type: "Point", coordinates: [80.217, 6.0328] },
      },
    ]),
  );
  const accounts = {
    hq: await createUser({ role: "hq_operator" }),
    supervisor: await createUser({ role: "hq_supervisor" }),
    officer: await createUser({ role: "traffic_officer", stationId: kandy._id }),
    officer2: await createUser({ role: "traffic_officer", stationId: kandy._id }),
    oic: await createUser({ role: "station_oic", stationId: kandy._id }),
    galleOfficer: await createUser({ role: "traffic_officer", stationId: galle._id }),
  };
  for (const [key, user] of Object.entries(accounts)) {
    tokens[key] = await signInAs(t, user);
    u[key] = as(tokens[key]);
  }
});
afterAll(() => t.close());
beforeEach(() => signInLimiter.reset());

describe("the person register", () => {
  it("checks identifiers, and refuses a second record for the same NIC", async () => {
    expect(
      (await u.officer?.post("/persons", { type: "individual", name: "A B", nic: "12345" }))
        ?.status,
    ).toBe(400);
    const id = await newPerson({
      name: "Kamal Silva",
      nic: "199012345678",
      address: "12 Hill Street, Kandy",
    });
    const dup = await u.officer?.post("/persons", {
      type: "individual",
      name: "K. Silva",
      nic: "1990 1234 5678",
    });
    expect(dup?.status).toBe(409);
    expect(dup?.body.error.fields).toMatchObject({ nic: expect.any(String), matchId: id });

    // Search by identifier — masked, town only.
    const found = await u.officer?.get("/persons/search?nic=199012345678");
    expect(found?.body.items).toEqual([
      expect.objectContaining({ id, nic: "********5678", town: "Kandy" }),
    ]);
    // Stations can't browse by name; HQ supervisors can.
    expect((await u.officer?.get("/persons/search?q=Kamal"))?.body.items).toEqual([]);
    expect((await u.supervisor?.get("/persons/search?q=Kamal"))?.body.items).toHaveLength(1);
  });
});

describe("vehicle trace", () => {
  it("records the vehicle and its owner; only the investigating officer or OIC may", async () => {
    const caseId = await kandyCase();
    const ownerId = await newPerson({
      name: "Nimal Perera",
      nic: "851234567V",
      address: "4 Lake Road, Kandy",
    });
    expect((await u.officer2?.post(`/cases/${caseId}/trace`, {}))?.status).toBe(400);
    const res2 = await as(tokens.officer2 ?? "").post(`/cases/${caseId}/trace`, {
      ownerId,
      ownerFrom: new Date(Date.now() - 100 * DAY).toISOString(),
      dmtReference: "DMT/1",
      checkedOn: new Date().toISOString(),
    });
    expect(res2.status).toBe(403);

    const res = await trace(caseId, ownerId);
    expect(res?.status).toBe(200);
    expect(res?.body).toMatchObject({
      status: "investigating",
      investigation: {
        vehicle: { plate: "CP CAB-1234", flags: [] },
        owner: { id: ownerId, name: "Nimal Perera" },
      },
    });
    const v = await Vehicle.findOne({ plate: "CP CAB-1234" }).lean();
    expect(v).toMatchObject({ make: "Toyota", ownership: [{ to: null }] });
  });

  it("after a sale, the owner on the offence date is responsible (V4), and history is kept (V3)", async () => {
    const seller = await newPerson({ name: "Old Owner", nic: "800000001V" });
    const buyer = await newPerson({ name: "New Owner", nic: "800000002V" });
    const first = await kandyCase({ plate: "WP KA-1111", occurredDaysAgo: 25 });
    await trace(first, seller, { ownerFrom: new Date(Date.now() - 400 * DAY).toISOString() });

    // Sold 10 days ago; this offence was 20 days ago — still the seller's.
    const second = await kandyCase({ plate: "WP KA-1111", occurredDaysAgo: 20 });
    const res = await trace(second, buyer, {
      ownerFrom: new Date(Date.now() - 10 * DAY).toISOString(),
    });
    expect(res?.body.investigation.owner).toMatchObject({ id: seller, name: "Old Owner" });
    const v = await Vehicle.findOne({ plate: "WP KA-1111" }).lean();
    expect(v?.ownership.map((o) => [String(o.personId), o.to !== null])).toEqual([
      [seller, true],
      [buyer, false],
    ]);
  });

  it("reuses a recent trace, but not one older than 6 months (V2)", async () => {
    const owner = await newPerson({ name: "Reuse Owner", nic: "800000003V" });
    const first = await kandyCase({ plate: "SP CAR-2020" });
    await trace(first, owner);
    const second = await kandyCase({ plate: "SP CAR-2020" });
    const check = await u.officer?.get(`/cases/${second}/vehicle-check`);
    expect(check?.body).toMatchObject({
      reusable: true,
      vehicle: { ownerOnOffenceDate: { name: "Reuse Owner" } },
    });
    const reused = await u.officer?.post(`/cases/${second}/trace/reuse`);
    expect(reused?.body.investigation.owner.name).toBe("Reuse Owner");

    await Vehicle.updateOne(
      { plate: "SP CAR-2020" },
      { $set: { lastCheckedAt: new Date(Date.now() - 200 * DAY) } },
    );
    const third = await kandyCase({ plate: "SP CAR-2020" });
    const refused = await u.officer?.post(`/cases/${third}/trace/reuse`);
    expect(refused?.status).toBe(409);
    expect(refused?.body.error.code).toBe("recheck");
  });
});

describe("who sees people", () => {
  it("HQ supervisors and the handling station's investigators; every view is logged", async () => {
    const caseId = await kandyCase({ plate: "NW AB-3333" });
    const ownerId = await newPerson({
      name: "Private Person",
      nic: "800000004V",
      address: "1 A Road, Kurunegala",
    });
    await trace(caseId, ownerId);

    expect((await u.officer?.get(`/persons/${ownerId}`))?.status).toBe(200);
    expect((await u.supervisor?.get(`/persons/${ownerId}`))?.body).toMatchObject({
      name: "Private Person",
      nic: "800000004V",
      cases: [{ caseId, role: "owner" }],
    });
    // Another officer at the station: not their case (scope A).
    expect((await u.officer2?.get(`/persons/${ownerId}`))?.status).toBe(404);
    expect((await u.galleOfficer?.get(`/persons/${ownerId}`))?.status).toBe(404);
    // HQ operators have no access to people; on the case they see "Recorded".
    expect((await u.hq?.get(`/persons/${ownerId}`))?.status).toBe(403);
    expect((await u.hq?.get(`/cases/${caseId}`))?.body.investigation.owner).toEqual({
      id: null,
      name: "Recorded",
    });
    const views = await AuditEntry.countDocuments({
      action: "persons.viewed",
      "target.id": ownerId,
    });
    expect(views).toBe(2);
  });

  it("corrections need a reason and are kept (V5)", async () => {
    const id = await newPerson({ name: "Fix Me", nic: "800000005V" });
    const caseId = await kandyCase({ plate: "UP CB-4444" });
    await trace(caseId, id);
    expect(
      (await u.officer?.patch(`/persons/${id}`, { address: "9 New Road, Kandy" }))?.status,
    ).toBe(400);
    const res = await u.officer?.patch(`/persons/${id}`, {
      address: "9 New Road, Kandy",
      reason: "Owner gave the new address in person.",
    });
    expect(res?.body).toMatchObject({
      address: "9 New Road, Kandy",
      changes: [{ fields: ["address"], reason: "Owner gave the new address in person." }],
    });
  });
});

describe("investigation work", () => {
  it("driver, evidence review, statements with a scanned file, and flags", async () => {
    const caseId = await kandyCase({ plate: "EP XY-5555" });
    const driver = await newPerson({ name: "The Driver", licenceNumber: "B1234567" });
    const res = await u.officer?.post(`/cases/${caseId}/driver`, {
      personId: driver,
      basis: "statement",
    });
    expect(res?.body.investigation.driver).toMatchObject({
      name: "The Driver",
      basis: "statement",
    });

    const review = {
      plateReadable: true,
      vehicleMatches: true,
      timePlaceConsistent: true,
      noEditing: false,
      offenceVisible: true,
    };
    expect((await u.officer?.put(`/cases/${caseId}/review`, review))?.status).toBe(400);
    const reviewed = await u.officer?.put(`/cases/${caseId}/review`, {
      ...review,
      note: "The timestamp on the photo looks edited.",
    });
    expect(reviewed?.body.investigation.review).toMatchObject({ noEditing: false });

    const up = await t
      .http()
      .post(`/api/v1/cases/${caseId}/evidence`)
      .set(CSRF)
      .set("Authorization", `Bearer ${tokens.officer}`)
      .attach("file", jpeg, "statement-scan.jpg");
    expect(up.status).toBe(201);
    const evidenceId = up.body.investigation.evidence[0].id;
    // Case evidence: visible at the station, not elsewhere.
    expect((await u.oic?.get(`/evidence/${evidenceId}/view`))?.status).toBe(200);
    expect((await u.galleOfficer?.get(`/evidence/${evidenceId}/view`))?.status).toBe(404);
    // The investigating officer may open the original of their own case.
    expect(
      (await u.officer?.get(`/evidence/${evidenceId}/original?reason=For+the+statement`))?.status,
    ).toBe(200);

    const st = await u.officer?.post(`/cases/${caseId}/statements`, {
      role: "driver",
      personId: driver,
      takenAt: new Date().toISOString(),
      summary: "Admitted driving without a seat belt.",
      evidenceId,
    });
    expect(st?.body.investigation.statements).toEqual([
      expect.objectContaining({ role: "driver", name: "The Driver", evidenceId }),
    ]);

    // Stolen without a date is refused; with one, the case shows the flag.
    const vehicleCase = await kandyCase({ plate: "EP XY-6666" });
    const owner = await newPerson({ name: "Stolen Owner", nic: "800000006V" });
    const traced = await trace(vehicleCase, owner);
    const vehicleId = traced?.body.investigation.vehicle.id;
    expect(
      (
        await u.officer?.post(`/vehicles/${vehicleId}/flags`, {
          type: "reported_stolen",
          note: "Owner reported theft.",
        })
      )?.status,
    ).toBe(400);
    await u.officer?.post(`/vehicles/${vehicleId}/flags`, {
      type: "reported_stolen",
      note: "Owner reported theft.",
      reference: "CIB/KDY/123",
      since: new Date(Date.now() - 2 * DAY).toISOString(),
    });
    expect(
      (await u.officer?.get(`/cases/${vehicleCase}`))?.body.investigation.vehicle.flags,
    ).toEqual(["reported_stolen"]);
    expect((await u.galleOfficer?.get(`/vehicles/${vehicleId}`))?.status).toBe(404);
    expect((await u.supervisor?.get(`/vehicles/${vehicleId}`))?.body.cases).toHaveLength(1);
  });

  it("keeps the audit chain intact", async () => {
    expect(await verifyAuditChain()).toBeNull();
  });
});

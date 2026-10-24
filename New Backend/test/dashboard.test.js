// Dashboards — docs/12: one per role (D12-1), scope follows permissions
// (D5), figures computed from the records (§6), the period and its
// comparison (§5), and the 60-second cache (D12-4).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { Case } from "#src/modules/cases/index.js";
import { clearDashboardCache } from "#src/modules/dashboard/dashboard.service.js";
import { OffenceVersion } from "#src/modules/offences/offences.model.js";
import { Division, Station } from "#src/modules/organisation/organisation.model.js";
import { Report } from "#src/modules/reports/report.model.js";
import { CSRF, createTestApp, createUser, signInAs } from "./helpers/app.js";

/** @type {Awaited<ReturnType<typeof createTestApp>>} */
let t;
/** @type {Record<string, ReturnType<typeof as>>} */
const u = {};
/** @type {Record<string, any>} */
const users = {};
/** @type {any} */ let kandy;
/** @type {any} */ let galle;
const DAY = 86_400_000;
let seq = 0;

/** @param {string} token */
const as = (token) => ({
  get: (/** @type {string} */ p) =>
    t.http().get(`/api/v1${p}`).set("Authorization", `Bearer ${token}`),
  post: (/** @type {string} */ p, /** @type {object} */ b = {}) =>
    t.http().post(`/api/v1${p}`).set(CSRF).set("Authorization", `Bearer ${token}`).send(b),
});

/** A tile's value by its key. @param {any} body @param {string} key */
const tile = (body, key) =>
  [...(body.attention ?? []), ...(body.throughput ?? [])].find((f) => f.key === key);

/**
 * A report HQ records; accepted, it goes to the nearest station.
 * @param {{ priority?: "P1" | "P2", at?: { lat: number, lng: number }, accept?: boolean }} [o]
 */
async function report(o = {}) {
  seq += 1;
  const at = o.at ?? { lat: 7.2936, lng: 80.6413 };
  const occurredAt = new Date(Date.now() - 3_600_000).toISOString();
  const body = {
    channel: "whatsapp",
    reporter: { kind: "named", name: "Saman Kumara", phone: "0771234567" },
    occurredAt,
    ...at,
    address: "Main road",
    vehicleNumber: `WP DB-${String(1000 + seq)}`,
    offenceCodes: ["MTA-A"],
    description: "Driver seen committing the offence.",
    injuries: o.priority === "P1",
  };
  const r = await u.hq?.post("/reports", body);
  expect(r?.status).toBe(201);
  if (!o.accept) return { reportId: String(r?.body.id), caseId: null };
  const acc = await u.hq?.post(`/reports/${r?.body.id}/accept`, {
    offenceCodes: ["MTA-A"],
    vehicleNumber: body.vehicleNumber,
    priority: o.priority ?? "P2",
    occurredAt,
    ...at,
  });
  expect(acc?.status).toBe(200);
  return { reportId: String(r?.body.id), caseId: String(acc?.body.case.id) };
}

beforeAll(async () => {
  t = await createTestApp();
  await OffenceVersion.create(
    /** @type {any} */ ({
      code: "MTA-A",
      version: 1,
      name: "Offence A",
      legalReference: "s. A",
      outcome: "spot_fine",
      spotFine: 1000,
      severity: "minor",
      citizenReportable: true,
      publicName: "MTA-A",
      publicDescription: "A test offence description.",
      active: true,
      effectiveFrom: new Date(Date.now() - DAY),
      current: true,
      source: "test",
      changedBy: "test",
      reason: "test",
    }),
  );
  const [dk, dg] = await Division.create([
    { name: "Kandy", code: "KANDY" },
    { name: "Galle", code: "GALLE" },
  ]);
  [kandy, galle] = await Station.create(
    /** @type {any[]} */ ([
      {
        name: "Kandy Police Station",
        code: "KDY",
        divisionId: dk?._id,
        verified: true,
        location: { type: "Point", coordinates: [80.6337, 7.2906] },
      },
      {
        name: "Galle Police Station",
        code: "GLE",
        divisionId: dg?._id,
        verified: true,
        location: { type: "Point", coordinates: [80.217, 6.0329] },
      },
    ]),
  );
  Object.assign(users, {
    hq: await createUser({ role: "hq_operator" }),
    executive: await createUser({ role: "executive" }),
    sysadmin: await createUser({ role: "system_admin" }),
    division: await createUser({ role: "division_supervisor", divisionId: dk?._id }),
    oic: await createUser({ role: "station_oic", stationId: kandy._id }),
    officer: await createUser({ role: "traffic_officer", stationId: kandy._id }),
    clerk: await createUser({ role: "station_clerk", stationId: kandy._id }),
  });
  for (const [k, user] of Object.entries(users)) u[k] = as(await signInAs(t, user));
});
afterAll(() => t.close());
beforeEach(() => {
  signInLimiter.reset();
  clearDashboardCache();
});

describe("one dashboard per role (D12-1, D5)", () => {
  it("HQ gets the Command centre; OIC My station; officers and clerks My work; others none", async () => {
    expect((await u.hq?.get("/dashboard"))?.body).toMatchObject({
      kind: "command",
      national: true,
    });
    expect((await u.executive?.get("/dashboard"))?.body.kind).toBe("command");
    expect((await u.division?.get("/dashboard"))?.body).toMatchObject({
      kind: "command",
      national: false,
    });
    expect((await u.oic?.get("/dashboard"))?.body.kind).toBe("station");
    expect((await u.officer?.get("/dashboard"))?.body.kind).toBe("mine");
    expect((await u.clerk?.get("/dashboard"))?.body.kind).toBe("mine");
    expect((await u.sysadmin?.get("/dashboard"))?.status).toBe(403);
  });
});

describe("figures from the records (§6)", () => {
  it("counts triage waiting, P1, received and accepted, each with its definition and list", async () => {
    await report();
    await report({ priority: "P1" });
    await report({ accept: true });
    const body = (await u.hq?.get("/dashboard"))?.body;
    expect(tile(body, "triage_waiting")).toMatchObject({
      value: 2,
      link: "/reports?view=triage",
      definition: expect.stringMatching(/waiting for HQ triage/),
    });
    expect(tile(body, "p1_waiting")?.value).toBe(1);
    expect(tile(body, "received")).toMatchObject({ value: 3, previous: 0 });
    expect(tile(body, "cases_opened")?.value).toBe(1);
    expect(
      body.charts.outcome.parts.find((/** @type {any} */ p) => p.key === "accepted").value,
    ).toBe(1);
    expect(
      body.charts.pipeline.bars.find((/** @type {any} */ b) => b.key === "dispatched").value,
    ).toBe(1);
    expect(body.charts.offences.bars[0]).toMatchObject({ key: "MTA-A", label: "Offence A" });
    const day = body.charts.channels.points.at(-1);
    expect(day.hotline).toBe(3);
    expect(body.charts.channels.points).toHaveLength(30);
  });

  it("compares with the period before", async () => {
    const { reportId } = await report();
    await Report.updateOne(
      { _id: reportId },
      { $set: { receivedAt: new Date(Date.now() - 35 * DAY) } },
    );
    const body = (await u.hq?.get("/dashboard"))?.body;
    expect(tile(body, "received")?.previous).toBe(1);
  });

  it("a station sees only its own records; a division supervisor only their division", async () => {
    const k = await report({ accept: true });
    const g = await report({ accept: true, at: { lat: 6.0367, lng: 80.2165 } });
    expect((await Case.findById(g.caseId).lean())?.stationId?.toString()).toBe(String(galle._id));

    const oic = (await u.oic?.get("/dashboard"))?.body;
    const kandyWaiting = await Case.countDocuments({ stationId: kandy._id, status: "dispatched" });
    expect(tile(oic, "to_accept")?.value).toBe(kandyWaiting);

    const division = (await u.division?.get("/dashboard"))?.body;
    const names = division.stations.rows.map((/** @type {any} */ r) => r.name);
    expect(names).toContain("Kandy Police Station");
    expect(names).not.toContain("Galle Police Station");
    // Asking for a station outside their division changes nothing.
    const other = (await u.division?.get(`/dashboard?stationId=${galle._id}`))?.body;
    expect(other.stations.rows.map((/** @type {any} */ r) => r.name)).not.toContain(
      "Galle Police Station",
    );
    expect(k.caseId).toBeTruthy();
  });

  it("an officer's queue is their cases, soonest due first", async () => {
    const { caseId } = await report({ accept: true });
    await u.oic?.post(`/cases/${caseId}/accept`);
    await u.oic?.post(`/cases/${caseId}/officer`, { officerId: String(users.officer._id) });
    const body = (await u.officer?.get("/dashboard"))?.body;
    expect(tile(body, "my_cases")?.value).toBe(1);
    expect(body.queue[0]).toMatchObject({ id: caseId, link: `/cases/${caseId}` });
    expect(body.charts).toBeUndefined();
  });

  it("on-time acceptance counts dispatches accepted within their limit, or with none to miss", async () => {
    await Case.deleteMany({});
    const a = await report({ accept: true });
    await u.oic?.post(`/cases/${a.caseId}/accept`);
    const b = await report({ accept: true });
    await u.oic?.post(`/cases/${b.caseId}/accept`);
    // Recorded at the station: accepted at once, no limit.
    await Case.updateOne({ _id: b.caseId }, { $set: { "dispatches.0.acceptBy": null } });
    await report({ accept: true }); // not accepted yet
    const body = (await u.hq?.get("/dashboard"))?.body;
    const row = body.stations.rows.find(
      (/** @type {any} */ r) => r.name === "Kandy Police Station",
    );
    expect(row.onTime).toEqual({ accepted: 2, of: 3 });
  });
});

describe("period and freshness (§5, D12-4)", () => {
  it("accepts a custom range up to 24 months", async () => {
    expect(
      (await u.hq?.get("/dashboard?period=custom&from=2026-01-01&to=2026-03-31"))?.body.period.key,
    ).toBe("2026-01-01..2026-03-31");
    expect(
      (await u.hq?.get("/dashboard?period=custom&from=2023-01-01&to=2026-03-31"))?.status,
    ).toBe(400);
    expect((await u.hq?.get("/dashboard?period=custom&from=2026-01-01"))?.status).toBe(400);
  });

  it("caches each dashboard for 60 seconds", async () => {
    const first = (await u.hq?.get("/dashboard?period=7d"))?.body;
    await report();
    const second = (await u.hq?.get("/dashboard?period=7d"))?.body;
    expect(second.generatedAt).toBe(first.generatedAt);
    expect(tile(second, "received")?.value).toBe(tile(first, "received")?.value);
  });
});

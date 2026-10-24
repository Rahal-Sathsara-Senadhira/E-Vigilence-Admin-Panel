// Reports and triage — docs/02.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifyAuditChain } from "#src/core/audit/audit.js";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { Case } from "#src/modules/cases/index.js";
import { OffenceVersion } from "#src/modules/offences/offences.model.js";
import { Division, Station } from "#src/modules/organisation/organisation.model.js";
import { Report } from "#src/modules/reports/report.model.js";
import { CSRF, createTestApp, createUser, signInAs } from "./helpers/app.js";

/** @type {Awaited<ReturnType<typeof createTestApp>>} */
let t;
/** @type {any} */ let kandy;
/** @type {any} */ let galle;
/** @type {ReturnType<typeof as>} */ let hq;
/** @type {ReturnType<typeof as>} */ let hq2;

/** @param {string} token */
const as = (token) => ({
  get: (/** @type {string} */ p) =>
    t.http().get(`/api/v1${p}`).set("Authorization", `Bearer ${token}`),
  post: (/** @type {string} */ p, /** @type {object} */ b = {}) =>
    t.http().post(`/api/v1${p}`).set(CSRF).set("Authorization", `Bearer ${token}`).send(b),
});

/** @param {string} code @param {"minor" | "moderate" | "severe"} severity @returns {any} */
const offence = (code, severity) => ({
  code,
  version: 1,
  name: code,
  legalReference: code,
  outcome: "spot_fine",
  spotFine: 1000,
  severity,
  citizenReportable: true,
  publicName: code,
  publicDescription: "A test offence description.",
  active: true,
  effectiveFrom: new Date(Date.now() - 86_400_000),
  current: true,
  source: "test",
  changedBy: "test",
  reason: "test",
});

const hourAgo = () => new Date(Date.now() - 3_600_000).toISOString();
const report = (/** @type {object} */ extra = {}) => ({
  channel: "whatsapp",
  reporter: { kind: "named", name: "Saman Kumara", phone: "077 123 4567" },
  occurredAt: hourAgo(),
  lat: 7.2906,
  lng: 80.6337,
  address: "Dalada Veediya, Kandy",
  vehicleNumber: "cp cab 1234",
  offenceCodes: ["MTA-157A"],
  description: "Driver of a car without a seat belt near the temple.",
  ...extra,
});

beforeAll(async () => {
  t = await createTestApp();
  await OffenceVersion.create([offence("MTA-157A", "minor"), offence("MTA-217", "severe")]);
  const [div] = await Division.create([{ name: "Kandy", code: "KANDY" }]);
  [kandy, galle] = await Station.create([
    { name: "Kandy Police Station", code: "KANDY", divisionId: div?._id, verified: true },
    { name: "Galle Police Station", code: "GALLE", verified: true },
  ]);
  hq = as(await signInAs(t, await createUser({ role: "hq_operator" })));
  hq2 = as(await signInAs(t, await createUser({ role: "hq_supervisor" })));
});
afterAll(() => t.close());
beforeEach(() => signInLimiter.reset());

describe("recording", () => {
  it("HQ records a WhatsApp report into the queue, with a normalised plate and phone", async () => {
    const res = await hq.post("/reports", report());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      reportNumber: expect.stringMatching(/^RP-\d{4}-\d{6}$/),
      status: "pending",
      priority: "P2",
      vehicleNumber: "CP CAB-1234",
      reporter: { phone: "+94771234567" },
    });
  });

  it("finds reports by number, or by a plate in any spelling", async () => {
    const created = (await hq.post("/reports", report({ vehicleNumber: "WP KZ-9911" }))).body;
    for (const q of [created.reportNumber, "wpkz9911", "WP KZ 9911", "KZ-99"]) {
      const res = await hq.get(`/reports?view=all&q=${encodeURIComponent(q)}`);
      expect(res.body.items.map((/** @type {any} */ r) => r.id)).toContain(created.id);
    }
  });

  it("a severe offence or someone hurt is P1", async () => {
    expect((await hq.post("/reports", report({ offenceCodes: ["MTA-217"] }))).body.priority).toBe(
      "P1",
    );
    expect((await hq.post("/reports", report({ injuries: true }))).body.priority).toBe("P1");
  });

  it("refuses offences not in the schedule, old incidents and missing plates", async () => {
    expect(
      (await hq.post("/reports", report({ offenceCodes: ["MTA-999"] }))).body.error.fields
        .offenceCodes,
    ).toMatch(/MTA-999/);
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
    expect(
      (await hq.post("/reports", report({ occurredAt: old }))).body.error.fields.occurredAt,
    ).toMatch(/30 days/);
    expect(
      (await hq.post("/reports", report({ vehicleNumber: "" }))).body.error.fields.vehicleNumber,
    ).toBeTruthy();
    expect(
      (await hq.post("/reports", report({ vehicleNumber: "", plateUnknown: true }))).status,
    ).toBe(201);
  });

  it("a station's walk-in report opens the station's case at once, for HQ to review", async () => {
    const clerk = as(
      await signInAs(t, await createUser({ role: "station_clerk", stationId: kandy._id })),
    );
    const res = await clerk.post("/reports", report({ channel: "walk_in" }));
    expect(res.body).toMatchObject({
      status: "accepted",
      stationOriginated: true,
      underStationReview: true,
      case: { caseNumber: expect.stringMatching(/^TC-/) },
    });
    const c = await Case.findById(res.body.case.id).lean();
    // Accepted at the station; a clerk can't investigate, so the OIC assigns an officer.
    expect(c).toMatchObject({
      status: "accepted",
      stationId: kandy._id,
      investigatingOfficer: null,
      dispatches: [{ method: "station_recorded", acceptedBy: expect.any(String) }],
    });
    expect(
      (await hq.get("/reports?view=station_review")).body.items.map((/** @type {any} */ r) => r.id),
    ).toContain(res.body.id);
  });

  it("an officer's own observation needs a second officer to open the case", async () => {
    const o1 = await createUser({ role: "traffic_officer", stationId: kandy._id });
    const officer = as(await signInAs(t, o1));
    const res = await officer.post(
      "/reports",
      report({ channel: "officer", reporter: { kind: "anonymous" } }),
    );
    expect(res.body.status).toBe("awaiting_second_officer");
    expect(res.body.can.secondOfficerAccept).toBe(false);
    expect((await officer.post(`/reports/${res.body.id}/second-officer`)).status).toBe(403);
    const oic = as(
      await signInAs(t, await createUser({ role: "station_oic", stationId: kandy._id })),
    );
    const done = await oic.post(`/reports/${res.body.id}/second-officer`);
    expect(done.body).toMatchObject({
      status: "accepted",
      case: { caseNumber: expect.any(String) },
    });
    // The confirming OIC investigates, not the officer who saw it.
    const c = await Case.findById(done.body.case.id).lean();
    expect(c?.investigatingOfficer?.name).not.toBe(o1.name);
    expect(c).toMatchObject({ status: "accepted" });
  });

  it("stations can't record WhatsApp reports and HQ can't record walk-ins", async () => {
    const clerk = as(
      await signInAs(t, await createUser({ role: "station_clerk", stationId: kandy._id })),
    );
    expect((await clerk.post("/reports", report())).body.error.fields.channel).toBeTruthy();
    expect(
      (await hq.post("/reports", report({ channel: "walk_in" }))).body.error.fields.channel,
    ).toBeTruthy();
  });
});

describe("triage", () => {
  it("the queue is highest priority first, then oldest", async () => {
    await Report.deleteMany({});
    const a = (await hq.post("/reports", report())).body;
    const b = (await hq.post("/reports", report({ offenceCodes: ["MTA-217"] }))).body;
    const ids = (await hq.get("/reports?view=triage")).body.items.map(
      (/** @type {any} */ r) => r.id,
    );
    expect(ids).toEqual([b.id, a.id]);
  });

  it("one person at a time: the triage lock", async () => {
    const r = (await hq.post("/reports", report())).body;
    await hq.post(`/reports/${r.id}/lock`);
    const blocked = await hq2.post(`/reports/${r.id}/reject`, { reasonCode: "not_an_offence" });
    expect(blocked.body.error.code).toBe("locked");
    expect((await hq2.get(`/reports/${r.id}`)).body.can.triage).toBe(false);
  });

  it("accept opens a case with HQ's conclusions; the report keeps what was said", async () => {
    const r = (await hq.post("/reports", report())).body;
    const res = await hq.post(`/reports/${r.id}/accept`, {
      offenceCodes: ["MTA-157A"],
      vehicleNumber: "CP CAB-1235",
      lat: 7.2906,
      lng: 80.6337,
      address: "Dalada Veediya",
      occurredAt: r.occurredAt,
      priority: "P2",
    });
    expect(res.body.status).toBe("accepted");
    expect(res.body.vehicleNumber).toBe("CP CAB-1234");
    const c = await Case.findById(res.body.case.id).lean();
    expect(c).toMatchObject({ status: "open", facts: { vehicleNumber: "CP CAB-1235" } });
  });

  it("finds possible duplicates by plate", async () => {
    const r = (await hq.post("/reports", report())).body;
    const detail = (await hq.get(`/reports/${r.id}`)).body;
    expect(detail.matches.reports.length + detail.matches.cases.length).toBeGreaterThan(0);
    expect(detail.matches.reports[0].why).toBe("Same plate");
  });

  it("merge attaches to an existing case; undo puts it back in the queue", async () => {
    const first = (await hq.post("/reports", report())).body;
    const accepted = (
      await hq.post(`/reports/${first.id}/accept`, {
        offenceCodes: ["MTA-157A"],
        vehicleNumber: "CP CAB-1234",
        address: "Kandy",
        occurredAt: first.occurredAt,
        priority: "P2",
      })
    ).body;
    const second = (await hq.post("/reports", report())).body;
    const merged = await hq.post(`/reports/${second.id}/merge`, { caseId: accepted.case.id });
    expect(merged.body).toMatchObject({ status: "merged", case: { id: accepted.case.id } });
    expect((await Case.findById(accepted.case.id).lean())?.reportIds).toHaveLength(2);
    const undone = await hq.post(`/reports/${second.id}/undo-merge`, {
      reason: "Different incident on review",
    });
    expect(undone.body).toMatchObject({ status: "pending", case: null });
  });

  it("asks the reporter a question, records the answer, and returns to the queue", async () => {
    const r = (await hq.post("/reports", report())).body;
    const asked = await hq.post(`/reports/${r.id}/ask`, {
      question: "Which direction was the car going?",
    });
    expect(asked.body).toMatchObject({
      status: "needs_info",
      triage: { question: "Which direction was the car going?" },
    });
    const replied = await hq.post(`/reports/${r.id}/reply`, { answer: "Towards Peradeniya" });
    expect(replied.body).toMatchObject({
      status: "pending",
      triage: { replies: [{ text: "Towards Peradeniya" }] },
    });
  });

  it("anonymous reporters can't be asked", async () => {
    const r = (await hq.post("/reports", report({ reporter: { kind: "anonymous" } }))).body;
    expect(
      (await hq.post(`/reports/${r.id}/ask`, { question: "Which direction was the car going?" }))
        .body.error.code,
    ).toBe("anonymous");
  });

  it("reject with a reason the reporter sees; reconsider within 30 days", async () => {
    const r = (await hq.post("/reports", report())).body;
    const rejected = await hq.post(`/reports/${r.id}/reject`, {
      reasonCode: "insufficient_evidence",
      note: "Photo too dark",
    });
    expect(rejected.body.triage).toMatchObject({
      reasonCode: "insufficient_evidence",
      reasonText: expect.stringMatching(/evidence wasn't enough/),
    });
    expect(
      (await hq.post(`/reports/${r.id}/reconsider`, { reason: "Reporter sent a clearer photo" }))
        .body.status,
    ).toBe("pending");
  });

  it("rejecting a station report at review closes the station's empty case", async () => {
    const clerk = as(
      await signInAs(t, await createUser({ role: "station_clerk", stationId: galle._id })),
    );
    const r = (await clerk.post("/reports", report({ channel: "walk_in" }))).body;
    await hq.post(`/reports/${r.id}/reject`, { reasonCode: "not_an_offence" });
    expect((await Case.findById(r.case.id).lean())?.status).toBe("closed");
  });
});

describe("scope", () => {
  it("station staff see their station's reports only; HQ's queue is not theirs", async () => {
    const officer = as(
      await signInAs(t, await createUser({ role: "traffic_officer", stationId: galle._id })),
    );
    const items = (await officer.get("/reports?view=all&pageSize=100")).body.items;
    expect(items.length).toBeGreaterThan(0);
    const all = await Report.find({
      _id: { $in: items.map((/** @type {any} */ r) => r.id) },
    }).lean();
    expect(all.every((r) => String(r.stationId) === String(galle._id))).toBe(true);
    expect(
      (await officer.post(`/reports/${items[0].id}/reject`, { reasonCode: "not_an_offence" }))
        .status,
    ).toBe(403);
  });

  it("every change is audited", async () => {
    expect(await verifyAuditChain()).toBeNull();
  });
});

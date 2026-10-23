// Reports and triage — docs/02. Every channel through every triage outcome
// (docs/15 phase 1 "done when").

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OffencesService } from "../src/modules/offences/offences.service";
import { publishPublicSchedule, seedOffenceSchedule } from "../src/modules/offences/schedule.data";
import { ReportsService } from "../src/modules/reports/reports.service";
import { bearer, createStaff, createStation, createTestApp, signIn, type TestApp } from "./helpers";

let t: TestApp;
let reports: ReportsService;
let colombo: string;
let kandy: string;
let hq1: string;
let hq2: string;
let dev: string;
let officerA: string;
let officerB: string;
let kandyOfficer: string;

const COLOMBO_FORT = { lat: 6.9344, lng: 79.8428 };
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const whatsapp = (overrides: Record<string, unknown> = {}) => ({
  channel: "whatsapp",
  reporter: { kind: "named", name: "Saman Kumara", phone: "077 123 4567" },
  occurredAt: hoursAgo(2),
  location: COLOMBO_FORT,
  address: "Lotus Road, Colombo 01",
  vehicleNumber: "wp cab 1234",
  vehicleType: "car",
  offenceCodes: ["MTA-164"],
  description: "Car went through the red light at the Lotus Road junction.",
  ...overrides,
});

const acceptBody = (overrides: Record<string, unknown> = {}) => ({
  offenceCodes: ["MTA-164"],
  vehicleNumber: "WP CAB-1234",
  vehicleType: "car",
  location: COLOMBO_FORT,
  address: "Lotus Road, Colombo 01",
  occurredAt: hoursAgo(2),
  priority: "P2",
  noEvidenceReason: "Two officers at the junction confirmed it",
  ...overrides,
});

async function record(token: string, body: Record<string, unknown>) {
  const res = await t.http().post("/api/v1/reports").set(bearer(token)).send(body);
  if (res.status !== 201)
    throw new Error(`record failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

beforeAll(async () => {
  t = await createTestApp();
  await seedOffenceSchedule(t.conn, true);
  await publishPublicSchedule(t.conn);
  reports = t.app.get(ReportsService);
  colombo = await createStation(t, "Fort");
  kandy = await createStation(t, "Kandy");
  hq1 = (await signIn(t, await createStaff(t, { role: "hq" }))).token;
  hq2 = (await signIn(t, await createStaff(t, { role: "hq" }))).token;
  dev = (await signIn(t, await createStaff(t, { role: "dev" }))).token;
  officerA = (
    await signIn(t, await createStaff(t, { role: "station_officer", stationId: colombo }))
  ).token;
  officerB = (await signIn(t, await createStaff(t, { role: "station_oic", stationId: colombo })))
    .token;
  kandyOfficer = (
    await signIn(t, await createStaff(t, { role: "station_officer", stationId: kandy }))
  ).token;
});
afterAll(() => t.close());

describe("offence schedule", () => {
  it("is seeded, and the public copy has no fines or officer-only offences", async () => {
    const all = await t.http().get("/api/v1/offences").set(bearer(hq1));
    expect(all.body.length).toBeGreaterThanOrEqual(30);
    const pub = await t.http().get("/api/v1/offences/public").set(bearer(hq1));
    expect(pub.body.every((o: Record<string, unknown>) => !("spotFine" in o))).toBe(true);
    expect(pub.body.some((o: { code: string }) => o.code === "MTA-38")).toBe(false); // revenue licence: officers only
    expect(pub.body.some((o: { code: string }) => o.code === "MTA-158")).toBe(true);
  });

  it("a fine change is a new version; the old fine stays for the old dates (D14-8)", async () => {
    const before = new Date();
    await new Promise((r) => setTimeout(r, 20));
    const current = (await t.http().get("/api/v1/offences").set(bearer(hq1))).body.find(
      (o: { code: string }) => o.code === "MTA-166",
    );
    const { code: _c, version: _v, effectiveFrom: _e, source: _s, ...fields } = current;
    const res = await t
      .http()
      .put("/api/v1/offences/MTA-166")
      .set(bearer(hq1))
      .send({ ...fields, spotFine: 1_500, reason: "New gazette notification" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ version: 2, spotFine: 1_500 });

    const old = await t.app.get(OffencesService).versionAt("MTA-166", before);
    expect(old?.spotFine).toBe(1_000);

    const byDev = await t
      .http()
      .put("/api/v1/offences/MTA-166")
      .set(bearer(dev))
      .send({ ...fields, reason: "Testing access" });
    expect(byDev.status).toBe(403);
  });
});

describe("recording reports", () => {
  it("HQ records a WhatsApp report into the queue with a number and a triage deadline", async () => {
    const r = await record(hq1, whatsapp());
    expect(r.reportNumber).toMatch(/^RP-\d{4}-\d{6}$/);
    expect(r).toMatchObject({
      status: "pending",
      suggestedPriority: "P2",
      vehicleNumber: "WP CAB-1234",
      channel: "whatsapp",
    });
    const hours = (new Date(r.dueAt).getTime() - new Date(r.receivedAt).getTime()) / 3_600_000;
    expect(hours).toBeCloseTo(24, 1);
  });

  it("a severe offence suggests P1 with a 2-hour triage limit (§8, D02-2)", async () => {
    const r = await record(
      hq1,
      whatsapp({ offenceCodes: ["MTA-216"], description: "Driver was swerving and seemed drunk." }),
    );
    expect(r.suggestedPriority).toBe("P1");
    const hours = (new Date(r.dueAt).getTime() - new Date(r.receivedAt).getTime()) / 3_600_000;
    expect(hours).toBeCloseTo(2, 1);
  });

  it("refuses unknown offences, old incidents, foreign locations and the wrong channel", async () => {
    const unknown = await t
      .http()
      .post("/api/v1/reports")
      .set(bearer(hq1))
      .send(whatsapp({ offenceCodes: ["MTA-999"] }));
    expect(unknown.body.error.fields.offenceCodes).toMatch(/MTA-999/);
    const old = await t
      .http()
      .post("/api/v1/reports")
      .set(bearer(hq1))
      .send(whatsapp({ occurredAt: hoursAgo(24 * 31) }));
    expect(old.body.error.fields.occurredAt).toBeDefined();
    const abroad = await t
      .http()
      .post("/api/v1/reports")
      .set(bearer(hq1))
      .send(whatsapp({ location: { lat: 13.08, lng: 80.27 } }));
    expect(abroad.status).toBe(400);
    const walkInByHq = await t
      .http()
      .post("/api/v1/reports")
      .set(bearer(hq1))
      .send(whatsapp({ channel: "walk_in" }));
    expect(walkInByHq.status).toBe(403);
    const whatsappByStation = await t
      .http()
      .post("/api/v1/reports")
      .set(bearer(officerA))
      .send(whatsapp());
    expect(whatsappByStation.status).toBe(403);
  });

  it("the queue shows the highest priority first, then the oldest (§5)", async () => {
    const res = await t.http().get("/api/v1/reports?view=queue&pageSize=100").set(bearer(hq1));
    const priorities = res.body.items.map(
      (r: { priority: string | null; suggestedPriority: string }) =>
        r.priority ?? r.suggestedPriority,
    );
    const firstP2 = priorities.indexOf("P2");
    expect(priorities.slice(firstP2).includes("P1")).toBe(false);
  });
});

describe("triage lock (§5)", () => {
  it("lets one HQ user decide at a time", async () => {
    const r = await record(hq1, whatsapp());
    expect((await t.http().post(`/api/v1/reports/${r.id}/lock`).set(bearer(hq1))).status).toBe(200);
    const locked = await t.http().post(`/api/v1/reports/${r.id}/lock`).set(bearer(hq2));
    expect(locked.status).toBe(409);
    const decide = await t
      .http()
      .post(`/api/v1/reports/${r.id}/accept`)
      .set(bearer(hq2))
      .send(acceptBody());
    expect(decide.body.error.code).toBe("report_locked");
    await t.http().delete(`/api/v1/reports/${r.id}/lock`).set(bearer(hq1));
    expect((await t.http().post(`/api/v1/reports/${r.id}/lock`).set(bearer(hq2))).status).toBe(200);
  });
});

describe("accept, merge and undo (§6.1–6.2)", () => {
  let caseId: string;

  it("needs a reason to accept a citizen report without evidence (D02-4)", async () => {
    const r = await record(hq1, whatsapp());
    const noReason = await t
      .http()
      .post(`/api/v1/reports/${r.id}/accept`)
      .set(bearer(hq1))
      .send(acceptBody({ noEvidenceReason: undefined }));
    expect(noReason.body.error.fields.noEvidenceReason).toBeDefined();

    const ok = await t
      .http()
      .post(`/api/v1/reports/${r.id}/accept`)
      .set(bearer(hq1))
      .send(acceptBody({ offenceCodes: ["MTA-164", "MTA-157A"] }));
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("accepted");
    expect(ok.body.caseNumber).toMatch(/^TC-\d{4}-\d{6}$/);
    // The report keeps what was said; the case holds what police concluded.
    expect(ok.body.offenceCodes).toEqual(["MTA-164"]);
    const c = await t.conn.collection("cases").findOne({ caseNumber: ok.body.caseNumber });
    expect(c?.offenceCodes).toEqual(["MTA-164", "MTA-157A"]);
    caseId = String(c!._id);
  });

  it("offers the case as a match for a second report of the same car, and merges into it", async () => {
    const second = await record(
      hq1,
      whatsapp({ reporter: { kind: "named", name: "Nirosha", phone: "0712223344" } }),
    );
    const matches = await t.http().get(`/api/v1/reports/${second.id}/matches`).set(bearer(hq1));
    const match = matches.body.find((m: { id: string }) => m.id === caseId);
    expect(match.reasons).toEqual(expect.arrayContaining(["same_plate", "same_offence_nearby"]));

    const merged = await t
      .http()
      .post(`/api/v1/reports/${second.id}/merge`)
      .set(bearer(hq1))
      .send({ caseId });
    expect(merged.body).toMatchObject({ status: "merged", caseId });
    const c = await t.conn.collection("cases").findOne({ caseNumber: merged.body.caseNumber });
    expect(c?.reportIds).toHaveLength(2);

    const undone = await t
      .http()
      .post(`/api/v1/reports/${second.id}/undo-merge`)
      .set(bearer(hq1))
      .send({ reason: "Different car on closer look" });
    expect(undone.body).toMatchObject({ status: "pending", caseId: null });
    const after = await t.conn.collection("cases").findOne({ caseNumber: merged.body.caseNumber });
    expect(after?.reportIds).toHaveLength(1);
  });

  it("refuses moves the triage machine doesn't allow", async () => {
    const r = await record(hq1, whatsapp());
    const res = await t
      .http()
      .post(`/api/v1/reports/${r.id}/undo-merge`)
      .set(bearer(hq1))
      .send({ reason: "Not merged at all" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("invalid_transition");
  });
});

describe("needs information (§6.3)", () => {
  it("can't ask an anonymous reporter", async () => {
    const r = await record(hq1, whatsapp({ reporter: { kind: "anonymous" } }));
    const res = await t
      .http()
      .post(`/api/v1/reports/${r.id}/needs-info`)
      .set(bearer(hq1))
      .send({ question: "Which way was it going?" });
    expect(res.body.error.code).toBe("anonymous_reporter");
  });

  it("asks, records the answer, and returns the report to the queue", async () => {
    const r = await record(hq1, whatsapp());
    const asked = await t
      .http()
      .post(`/api/v1/reports/${r.id}/needs-info`)
      .set(bearer(hq1))
      .send({ question: "Can you send the full video?" });
    expect(asked.body.status).toBe("needs_info");
    const days =
      (new Date(asked.body.question.dueAt).getTime() -
        new Date(asked.body.question.askedAt).getTime()) /
      86_400_000;
    expect(days).toBeCloseTo(7, 3);
    const answered = await t
      .http()
      .post(`/api/v1/reports/${r.id}/reply`)
      .set(bearer(hq1))
      .send({ answer: "Sending it by WhatsApp now" });
    expect(answered.body).toMatchObject({
      status: "pending",
      question: { answer: "Sending it by WhatsApp now" },
    });
  });

  it("rejects with no_response when the reply is overdue", async () => {
    const r = await record(hq1, whatsapp());
    await t
      .http()
      .post(`/api/v1/reports/${r.id}/needs-info`)
      .set(bearer(hq1))
      .send({ question: "Which lane was the car in?" });
    const expired = await reports.expireUnanswered(new Date(Date.now() + 8 * 86_400_000));
    expect(expired).toBeGreaterThanOrEqual(1);
    const after = await t.http().get(`/api/v1/reports/${r.id}`).set(bearer(hq1));
    expect(after.body.rejection).toMatchObject({ code: "no_response" });
    expect(after.body.rejection.reporterMessage).toMatch(/didn't receive the information/);
  });
});

describe("reject, reconsider and reporter abuse (§6.4, §10)", () => {
  it("flags a reporter after three fabricated reports in 90 days, and warns on their next report", async () => {
    const liar = { kind: "named", name: "Fake Reporter", phone: "0759998877" };
    for (let i = 0; i < 3; i++) {
      const r = await record(hq1, whatsapp({ reporter: liar }));
      const res = await t
        .http()
        .post(`/api/v1/reports/${r.id}/reject`)
        .set(bearer(hq1))
        .send({ reasonCode: "fabricated", note: "Edited video" });
      expect(res.body.rejection.reporterMessage).toBe("We couldn't accept this report.");
    }
    const next = await record(hq1, whatsapp({ reporter: liar }));
    expect(next.reporterFlagged).toBe(true);
    const detail = await t.http().get(`/api/v1/reports/${next.id}`).set(bearer(hq1));
    expect(detail.body.reporter).toMatchObject({ flagged: true, abuseCount: 3 });
  });

  it("reconsiders within 30 days, not after", async () => {
    const r = await record(hq1, whatsapp());
    await t
      .http()
      .post(`/api/v1/reports/${r.id}/reject`)
      .set(bearer(hq1))
      .send({ reasonCode: "insufficient_evidence" });
    const ok = await t
      .http()
      .post(`/api/v1/reports/${r.id}/reconsider`)
      .set(bearer(hq1))
      .send({ reason: "Reporter sent a clearer photo" });
    expect(ok.body.status).toBe("pending");

    const r2 = await record(hq1, whatsapp());
    await t
      .http()
      .post(`/api/v1/reports/${r2.id}/reject`)
      .set(bearer(hq1))
      .send({ reasonCode: "too_old" });
    await t.conn
      .collection("incident_reports")
      .updateOne(
        { reportNumber: r2.reportNumber },
        { $set: { "rejection.at": new Date(Date.now() - 31 * 86_400_000) } },
      );
    const late = await t
      .http()
      .post(`/api/v1/reports/${r2.id}/reconsider`)
      .set(bearer(hq1))
      .send({ reason: "Second thoughts" });
    expect(late.body.error.code).toBe("too_late");
  });
});

describe("station-recorded reports (§7)", () => {
  it("a walk-in opens a case at the station and waits for HQ review", async () => {
    const r = await record(officerA, whatsapp({ channel: "walk_in", vehicleNumber: "CP KA-4455" }));
    expect(r).toMatchObject({ status: "accepted", stationName: "Fort" });
    const detail = await t.http().get(`/api/v1/reports/${r.id}`).set(bearer(officerA));
    expect(detail.body).toMatchObject({ reviewedByHq: false });
    expect(detail.body.caseNumber).toMatch(/^TC-/);

    const review = await t
      .http()
      .get("/api/v1/reports?view=station_review&pageSize=100")
      .set(bearer(hq1));
    expect(review.body.items.some((i: { id: string }) => i.id === r.id)).toBe(true);
    const reviewed = await t.http().post(`/api/v1/reports/${r.id}/review`).set(bearer(hq1));
    expect(reviewed.body.reviewedByHq).toBe(true);
  });

  it("HQ can reject a station-accepted report at review; the empty station case closes", async () => {
    const r = await record(officerA, whatsapp({ channel: "phone" }));
    const caseNumber = (await t.http().get(`/api/v1/reports/${r.id}`).set(bearer(hq1))).body
      .caseNumber;
    const res = await t
      .http()
      .post(`/api/v1/reports/${r.id}/reject`)
      .set(bearer(hq1))
      .send({ reasonCode: "not_an_offence" });
    expect(res.body.status).toBe("rejected");
    const c = await t.conn.collection("cases").findOne({ caseNumber });
    expect(c).toMatchObject({ status: "closed", reportIds: [] });
  });

  it("an officer can't accept their own observation; another officer can (S1)", async () => {
    const r = await record(
      officerA,
      whatsapp({
        channel: "officer",
        reporter: { kind: "anonymous" },
        vehicleNumber: "WP PQ-7788",
      }),
    );
    expect(r.status).toBe("pending_station");
    const self = await t
      .http()
      .post(`/api/v1/reports/${r.id}/station-accept`)
      .set(bearer(officerA));
    expect(self.body.error.code).toBe("separation_of_duties");
    const other = await t
      .http()
      .post(`/api/v1/reports/${r.id}/station-accept`)
      .set(bearer(officerB));
    expect(other.status).toBe(200);
    expect(other.body).toMatchObject({ status: "accepted", reviewedByHq: false });
  });

  it("other stations can't see it, and stations can't use the triage queue", async () => {
    const r = await record(officerA, whatsapp({ channel: "walk_in" }));
    expect((await t.http().get(`/api/v1/reports/${r.id}`).set(bearer(kandyOfficer))).status).toBe(
      404,
    );
    expect((await t.http().get("/api/v1/reports?view=queue").set(bearer(officerA))).status).toBe(
      403,
    );
    const accept = await t
      .http()
      .post(`/api/v1/reports/${r.id}/accept`)
      .set(bearer(officerB))
      .send(acceptBody());
    expect(accept.status).toBe(403);
  });
});

describe("support access (docs/01 §4.5, docs/10 §5.2)", () => {
  it("dev sees a report with the reporter hidden, and the view is logged", async () => {
    const r = await record(hq1, whatsapp());
    const res = await t.http().get(`/api/v1/reports/${r.id}`).set(bearer(dev));
    expect(res.body.reporter).toMatchObject({ name: "Hidden", phone: "*********567" });
    const audit = await t.conn
      .collection("audit_log")
      .findOne({ action: "support.report_viewed", "target.id": r.id });
    expect(audit).not.toBeNull();
    expect(
      (await t.http().post(`/api/v1/reports/${r.id}/accept`).set(bearer(dev)).send(acceptBody()))
        .status,
    ).toBe(403);
  });
});

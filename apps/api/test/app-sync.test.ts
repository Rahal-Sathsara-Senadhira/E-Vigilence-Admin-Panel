// Mobile-app import — docs/11. The app's side is simulated by writing to its
// collections (`reports`, `report_replies`, citizen `users`) directly.

import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppSyncService } from "../src/modules/app-sync/app-sync.service";
import { publishPublicSchedule, seedOffenceSchedule } from "../src/modules/offences/schedule.data";
import { bearer, createStaff, createTestApp, signIn, type TestApp } from "./helpers";

process.env.APP_MEDIA_ALLOWED_HOSTS = "media.app.test";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let t: TestApp;
let sync: AppSyncService;
let hq: string;
let citizenId: Types.ObjectId;
const fetched: string[] = [];

const appReport = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  userId: citizenId,
  clientReportId: `device-${Math.random().toString(36).slice(2)}`,
  offenceIds: ["MTA-158"],
  occurredAt: new Date(Date.now() - 2 * 3_600_000),
  latitude: 7.2906,
  longitude: 80.6337,
  address: "Dalada Veediya, Kandy",
  vehicleNumber: "cp bae 4521",
  vehicleType: "Motor Bike",
  description: "Two people on a motorcycle without helmets near the lake.",
  evidence: [
    { url: "https://media.app.test/evidence/abc.png", kind: "image", capturedInApp: true },
  ],
  status: "In Progress",
  createdAt: new Date(),
  ...overrides,
});

const importedFor = (appId: Types.ObjectId) =>
  t.conn.collection("incident_reports").findOne({ sourceReportId: appId });
const updatesFor = (appId: Types.ObjectId) =>
  t.conn.collection("report_updates").find({ reportId: appId }).sort({ at: 1 }).toArray();

beforeAll(async () => {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    fetched.push(url);
    return new Response(new Uint8Array(PNG), {
      status: 200,
      headers: { "content-length": String(PNG.length) },
    });
  });
  t = await createTestApp();
  await seedOffenceSchedule(t.conn, true);
  await publishPublicSchedule(t.conn);
  sync = t.app.get(AppSyncService);
  hq = (await signIn(t, await createStaff(t, { role: "hq" }))).token;
  // A citizen account, as the app creates it in the shared users collection.
  citizenId = (
    await t.conn
      .collection("users")
      .insertOne({ name: "Dilini Jayasuriya", phone: "0761234567", role: "user" })
  ).insertedId;
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await t.close();
});

describe("importing app reports", () => {
  let appId: Types.ObjectId;

  it("imports a report once, with its evidence downloaded into our storage", async () => {
    const doc = appReport();
    appId = doc._id;
    await t.conn.collection("reports").insertOne(doc);

    const first = await sync.run();
    expect(first.imported).toBe(1);
    const again = await sync.run();
    expect(again.imported).toBe(0);

    const r = await importedFor(appId);
    expect(r).toMatchObject({
      channel: "citizen_app",
      status: "pending",
      vehicleNumber: "CP BAE-4521",
      vehicleType: "motorcycle",
      offenceCodes: ["MTA-158"],
      reporter: {
        kind: "citizen",
        userId: String(citizenId),
        name: "Dilini Jayasuriya",
        phone: "+94761234567",
      },
    });
    expect(r!.evidenceIds).toHaveLength(1);
    const item = await t.conn.collection("evidence_items").findOne({ _id: r!.evidenceIds[0] });
    expect(item).toMatchObject({ capturedInApp: true, kind: "photo", reportId: r!._id });

    const updates = await updatesFor(appId);
    expect(updates.map((u) => u.type)).toEqual(["received"]);
  });

  it("tells the citizen when HQ asks a question, and takes the reply from report_replies", async () => {
    const r = await importedFor(appId);
    const asked = await t
      .http()
      .post(`/api/v1/reports/${r!._id}/needs-info`)
      .set(bearer(hq))
      .send({ question: "Which direction were they riding?" });
    expect(asked.body.status).toBe("needs_info");
    const updates = await updatesFor(appId);
    expect(updates.at(-1)).toMatchObject({
      type: "needs_info",
      question: "Which direction were they riding?",
    });

    await t.conn.collection("report_replies").insertOne({
      reportId: appId,
      userId: citizenId,
      answer: "Towards the Temple of the Tooth",
      createdAt: new Date(),
    });
    const res = await sync.run();
    expect(res.replies).toBe(1);
    const after = await importedFor(appId);
    expect(after).toMatchObject({
      status: "pending",
      question: { answer: "Towards the Temple of the Tooth" },
    });
  });

  it("tells the citizen it is under review once accepted (no reason needed — it has evidence)", async () => {
    const r = await importedFor(appId);
    const res = await t
      .http()
      .post(`/api/v1/reports/${r!._id}/accept`)
      .set(bearer(hq))
      .send({
        offenceCodes: ["MTA-158"],
        vehicleNumber: "CP BAE-4521",
        vehicleType: "motorcycle",
        location: { lat: 7.2906, lng: 80.6337 },
        address: "Dalada Veediya, Kandy",
        occurredAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
        priority: "P2",
      });
    expect(res.status).toBe(200);
    expect((await updatesFor(appId)).at(-1)?.type).toBe("under_review");
    const legacy = await t.conn.collection("reports").findOne({ _id: appId });
    expect(legacy?.status).toBe("In Progress");
  });
});

describe("old app format and invalid reports (docs/11 §8–9)", () => {
  it("matches the old free-text issueType to the schedule, and flags what doesn't match", async () => {
    const matched = appReport({ offenceIds: undefined, issueType: "No helmet" });
    const unmatched = appReport({
      offenceIds: undefined,
      issueType: "Bad driving on the hill road",
    });
    await t.conn.collection("reports").insertMany([matched, unmatched]);
    await sync.run();
    expect((await importedFor(matched._id))?.offenceCodes).toEqual(["MTA-158"]);
    const u = await importedFor(unmatched._id);
    expect(u?.offenceCodes).toEqual([]);
    expect(u?.flags).toContain("offence_not_recognised");
    expect(u?.history[0].note).toContain("Bad driving on the hill road");
  });

  it("imports and rejects a report that's too old, telling the citizen why", async () => {
    const old = appReport({ occurredAt: new Date(Date.now() - 40 * 86_400_000) });
    await t.conn.collection("reports").insertOne(old);
    await sync.run();
    const r = await importedFor(old._id);
    expect(r).toMatchObject({ status: "rejected", rejection: { code: "too_old" } });
    const updates = await updatesFor(old._id);
    expect(updates.map((u) => u.type)).toEqual(["received", "rejected"]);
    const legacy = await t.conn.collection("reports").findOne({ _id: old._id });
    expect(legacy).toMatchObject({
      status: "Rejected",
      rejectionReason: "This happened more than 30 days ago, so we can't act on it.",
    });
  });

  it("never downloads from hosts that aren't allowed (SSRF)", async () => {
    const sneaky = appReport({
      evidence: [{ url: "http://169.254.169.254/latest/meta-data", kind: "image" }],
    });
    await t.conn.collection("reports").insertOne(sneaky);
    const before = fetched.length;
    await sync.run();
    expect(fetched.length).toBe(before);
    const r = await importedFor(sneaky._id);
    expect(r?.flags).toEqual(expect.arrayContaining(["evidence_download_failed", "no_evidence"]));
  });
});

describe("suspended reporters (docs/02 §10, docs/11 §6)", () => {
  it("records the suspension for the app and refuses the account's new reports", async () => {
    const key = `user:${citizenId}`;
    const res = await t
      .http()
      .post(`/api/v1/reporters/${key}/suspend`)
      .set(bearer(hq))
      .send({ reason: "Repeated edited videos" });
    expect(res.body).toMatchObject({ suspended: true, suspendedReason: "Repeated edited videos" });
    const account = await t.conn
      .collection("reward_accounts")
      .findOne({ userId: String(citizenId) });
    expect(account?.status).toBe("suspended");

    const blocked = appReport();
    await t.conn.collection("reports").insertOne(blocked);
    await sync.run();
    expect(await importedFor(blocked._id)).toBeNull();
    expect((await updatesFor(blocked._id)).map((u) => u.type)).toEqual(["rejected"]);

    await t
      .http()
      .post(`/api/v1/reporters/${key}/lift`)
      .set(bearer(hq))
      .send({ reason: "Reviewed with the reporter" });
    expect(
      (await t.conn.collection("reward_accounts").findOne({ userId: String(citizenId) }))?.status,
    ).toBe("active");
  });
});

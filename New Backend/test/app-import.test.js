// Mobile-app import — docs/11: each app report once, invalid ones refused
// with a reason the citizen sees, evidence copied into our storage, only
// from allowed addresses, updates and replies both ways.

import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyAuditChain } from "#src/core/audit/audit.js";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { createAppImport } from "#src/modules/app-import/index.js";
import { Evidence } from "#src/modules/evidence/index.js";
import { OffenceVersion } from "#src/modules/offences/offences.model.js";
import { Report } from "#src/modules/reports/report.model.js";
import { CSRF, createTestApp, createUser, signInAs } from "./helpers/app.js";
import { createLogger } from "#src/core/logger.js";

/** @type {Awaited<ReturnType<typeof createTestApp>>} */
let t;
/** @type {string} */ let hqToken;
const DAY = 86_400_000;

const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(4096, 3),
  Buffer.from([0xff, 0xd9]),
]);
const sha = (/** @type {Buffer} */ b) => createHash("sha256").update(b).digest("hex");

/** A stand-in for the app's media host: answers every request with `body`. */
const fakeFetch = vi.fn(async (/** @type {any} */ _url) => new Response(jpeg));

/** @param {object} [env] */
const importer = (env = {}) =>
  createAppImport({
    storage: t.storage,
    env: { APP_MEDIA_BASE_URL: undefined, APP_MEDIA_ALLOWED_HOSTS: ["media.app.lk"], ...env },
    logger: createLogger({ level: "silent" }),
    fetch: /** @type {any} */ (fakeFetch),
  });

const db = () => /** @type {import("mongodb").Db} */ (mongoose.connection.db);
const citizenId = new mongoose.Types.ObjectId();
let sequence = 0;

/** An app `reports` document in the new contract (docs/11 §4). @param {object} extra */
async function appReport(extra = {}) {
  sequence += 1;
  const doc = {
    _id: new mongoose.Types.ObjectId(),
    createdAt: new Date(Date.now() - 60_000 + sequence),
    userId: String(citizenId),
    clientReportId: `device-1-${sequence}`,
    offenceIds: ["MTA-157A"],
    occurredAt: new Date(Date.now() - 3_600_000),
    latitude: 6.9271,
    longitude: 79.8612,
    address: "Galle Road, Kollupitiya",
    vehicleNumber: "wp cab 4521",
    vehicleType: "Car",
    vehicleModel: "Toyota Axio",
    description: "Driver without a seat belt on Galle Road.",
    evidence: [
      {
        url: "https://media.app.lk/r/photo-1.jpg",
        kind: "photo",
        capturedInApp: true,
        capturedAt: new Date(Date.now() - 3_600_000),
      },
    ],
    ...extra,
  };
  await db().collection("reports").insertOne(doc);
  return doc;
}

/** @param {any} appId */
const imported = (appId) => Report.findOne({ "source.appReportId": appId }).lean();
/** @param {any} appId */
const updatesOf = (appId) =>
  db().collection("report_updates").find({ reportId: appId }).sort({ at: 1 }).toArray();

/** @param {string} p @param {object} body */
const post = (p, body) =>
  t.http().post(`/api/v1${p}`).set(CSRF).set("Authorization", `Bearer ${hqToken}`).send(body);

beforeAll(async () => {
  t = await createTestApp();
  await OffenceVersion.create(
    /** @type {any[]} */ (
      ["MTA-157A", "MTA-217"].map((code) => ({
        code,
        version: 1,
        name: code === "MTA-217" ? "Racing on a highway" : "Not wearing a seat belt",
        legalReference: code,
        outcome: "spot_fine",
        spotFine: 1000,
        severity: code === "MTA-217" ? "severe" : "minor",
        citizenReportable: true,
        publicName: code === "MTA-217" ? "Racing" : "No seat belt",
        publicDescription: "A test offence description.",
        active: true,
        effectiveFrom: new Date(Date.now() - DAY),
        current: true,
        source: "test",
        changedBy: "test",
        reason: "test",
      }))
    ),
  );
  await OffenceVersion.create(
    /** @type {any} */ ({
      code: "MTA-158",
      version: 1,
      name: "Riding a motorcycle without a protective helmet",
      legalReference: "MTA-158",
      outcome: "spot_fine",
      spotFine: 1000,
      severity: "minor",
      vehicleTypes: ["motorcycle"],
      citizenReportable: true,
      publicName: "No helmet",
      publicDescription: "A test offence description.",
      active: true,
      effectiveFrom: new Date(Date.now() - DAY),
      current: true,
      source: "test",
      changedBy: "test",
      reason: "test",
    }),
  );
  await db()
    .collection("users")
    .insertOne({ _id: citizenId, name: "Kamal Silva", phone: "0771234567" });
  hqToken = await signInAs(t, await createUser({ role: "hq_operator" }));
});
afterAll(() => t.close());
beforeEach(() => {
  signInLimiter.reset();
  fakeFetch.mockClear();
});

describe("importing reports", () => {
  it("imports a report once, normalised, with its evidence copied into our storage", async () => {
    const doc = await appReport();
    const first = await importer().run();
    expect(first).toMatchObject({ imported: 1, failed: 0 });

    const r = await imported(doc._id);
    expect(r).toMatchObject({
      channel: "citizen_app",
      status: "pending",
      priority: "P2",
      vehicleNumber: "WP CAB-4521",
      vehicleType: "car",
      vehicleDescription: "Toyota Axio",
      offenceCodes: ["MTA-157A"],
      reporter: { kind: "citizen", name: "Kamal Silva", phone: "+94771234567" },
      source: { clientReportId: doc.clientReportId, userId: String(citizenId) },
      flags: [],
    });
    expect(r?.reportNumber).toMatch(/^RP-\d{4}-\d{6}$/);
    expect(fakeFetch).toHaveBeenCalledTimes(1);

    const [ev] = await Evidence.find({ reportId: r?._id }).lean();
    expect(ev).toMatchObject({ sha256: sha(jpeg), kind: "photo", capturedInApp: true });
    expect(await t.storage.get(String(ev?.originalKey))).toBeTruthy();

    // The citizen is told; the old app's status label too (docs/11 §9).
    const updates = await updatesOf(doc._id);
    expect(updates.map((u) => u.type)).toEqual(["received"]);
    expect(updates[0]).toMatchObject({ reportNumber: r?.reportNumber, userId: String(citizenId) });
    expect(await db().collection("reports").findOne({ _id: doc._id })).toMatchObject({
      status: "In Progress",
    });

    // Running again imports nothing new.
    expect(await importer().run()).toMatchObject({ imported: 0, duplicates: 0 });
    expect(await Report.countDocuments({ "source.appReportId": doc._id })).toBe(1);
  });

  it("recognises a report re-sent by the same device", async () => {
    const original = await appReport();
    await importer().run();
    await appReport({ clientReportId: original.clientReportId });
    expect(await importer().run()).toMatchObject({ imported: 0, duplicates: 1 });
    expect(await Report.countDocuments({ "source.clientReportId": original.clientReportId })).toBe(
      1,
    );
  });

  it("puts a severe offence first", async () => {
    const doc = await appReport({ offenceIds: ["MTA-217"] });
    await importer().run();
    expect(await imported(doc._id)).toMatchObject({ priority: "P1" });
  });

  it.each([
    ["outside Sri Lanka", { latitude: 13.08, longitude: 80.27 }, "outside_jurisdiction"],
    ["too old", { occurredAt: new Date(Date.now() - 40 * DAY) }, "too_old"],
    ["not an offence in the schedule", { offenceIds: ["NOT-A-CODE"] }, "not_an_offence"],
    ["no offence at all", { offenceIds: [] }, "not_an_offence"],
  ])("refuses a report %s, and tells the citizen why", async (_label, extra, reason) => {
    const doc = await appReport(extra);
    expect(await importer().run()).toMatchObject({ refused: 1 });
    expect(await imported(doc._id)).toMatchObject({
      status: "rejected",
      triage: { reasonCode: reason, decidedBy: "Mobile app import" },
    });
    const [update] = await updatesOf(doc._id);
    expect(update).toMatchObject({ type: "rejected", title: "Closed" });
    expect(update?.message).not.toMatch(/MTA|station|fine/i);
  });

  it("refuses reports from a suspended account (docs/11 §6)", async () => {
    const suspended = new mongoose.Types.ObjectId();
    await db()
      .collection("reward_accounts")
      .insertOne({ userId: String(suspended), status: "suspended" });
    const doc = await appReport({ userId: String(suspended), clientReportId: "s-1" });
    await importer().run();
    expect(await imported(doc._id)).toMatchObject({
      status: "rejected",
      triage: { reasonCode: "account_suspended" },
    });
  });

  it("matches the old app's free-text offence, or flags it for triage (docs/11 §9)", async () => {
    const matched = await appReport({ offenceIds: undefined, issueType: "no seat belt" });
    const unknown = await appReport({ offenceIds: undefined, issueType: "Bad parking" });
    await importer().run();
    expect(await imported(matched._id)).toMatchObject({
      status: "pending",
      offenceCodes: ["MTA-157A"],
      flags: [],
    });
    const r = await imported(unknown._id);
    expect(r).toMatchObject({
      status: "pending",
      offenceCodes: [],
      flags: ["offence_not_recognised"],
    });
    expect(r?.description).toContain('"Bad parking"');
  });

  it("flags gallery files, unreadable plates and times in the future", async () => {
    const doc = await appReport({
      vehicleNumber: "??",
      occurredAt: new Date(Date.now() + DAY),
      evidence: [{ url: "https://media.app.lk/r/gallery.jpg", capturedInApp: false }],
    });
    await importer().run();
    const r = await imported(doc._id);
    expect(r?.flags).toEqual(
      expect.arrayContaining(["plate_unrecognised", "time_in_future", "not_captured_in_app"]),
    );
    expect(r).toMatchObject({ vehicleNumber: null, plateUnknown: true });
  });
});

describe("offences and the vehicle", () => {
  it("flags an offence that can't apply to the vehicle given, for triage to decide", async () => {
    const car = await appReport({ offenceIds: ["MTA-158"], vehicleType: "Car" });
    const bike = await appReport({ offenceIds: ["MTA-158"], vehicleType: "Motorcycle" });
    const cab = await appReport({ offenceIds: ["MTA-157A"], vehicleType: "Cab" });
    await importer().run();

    // Not refused: the citizen may have picked the wrong vehicle type.
    expect(await imported(car._id)).toMatchObject({
      status: "pending",
      vehicleType: "car",
      offenceCodes: ["MTA-158"],
      flags: ["offence_vehicle_mismatch"],
    });
    expect(await imported(bike._id)).toMatchObject({ vehicleType: "motorcycle", flags: [] });
    expect(await imported(cab._id)).toMatchObject({ vehicleType: "van", flags: [] });
  });

  it("refuses offences that don't fit the vehicle when HQ accepts a report", async () => {
    const doc = await appReport({ offenceIds: ["MTA-158"], vehicleType: "Motorcycle" });
    await importer().run();
    const id = String((await imported(doc._id))?._id);
    const res = await post(`/reports/${id}/accept`, {
      offenceCodes: ["MTA-158"],
      vehicleNumber: "WP CAB-4521",
      plateUnknown: false,
      vehicleType: "car",
      address: "Galle Road, Kollupitiya",
      occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
      priority: "P2",
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("applies only to motorcycles, not cars");
  });
});

describe("evidence downloads", () => {
  it("never fetches from addresses that aren't allowed, and flags the report", async () => {
    const doc = await appReport({
      evidence: [
        { url: "http://media.app.lk/plain-http.jpg" },
        { url: "https://169.254.169.254/latest/meta-data" },
        { url: "https://evil.example.com/x.jpg" },
        { url: "https://user:pw@media.app.lk/x.jpg" },
      ],
    });
    await importer().run();
    expect(fakeFetch).not.toHaveBeenCalled();
    const r = await imported(doc._id);
    expect(r).toMatchObject({ status: "pending", flags: ["evidence_download_failed"] });
    expect(r?.evidenceIds).toHaveLength(0);
  });

  it("allows subdomains when the allow-list says so, and resolves relative paths", async () => {
    const doc = await appReport({ evidence: [{ url: "uploads/a.jpg", capturedInApp: true }] });
    await importer({
      APP_MEDIA_BASE_URL: "https://cdn.media.app.lk/",
      APP_MEDIA_ALLOWED_HOSTS: [".media.app.lk"],
    }).run();
    expect(String(fakeFetch.mock.calls[0]?.[0])).toBe("https://cdn.media.app.lk/uploads/a.jpg");
    expect((await imported(doc._id))?.evidenceIds).toHaveLength(1);
  });

  it("sends the media key to the app, follows its redirect to storage without it", async () => {
    const key = "media-service-key-for-tests-0001";
    fakeFetch.mockImplementationOnce(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://bucket.acc.r2.cloudflarestorage.com/a.jpg?sig=1" },
        }),
    );
    const doc = await appReport({ evidence: [{ url: "https://media.app.lk/api/media/r2/a.jpg" }] });
    await importer({
      APP_MEDIA_ALLOWED_HOSTS: ["media.app.lk", ".r2.cloudflarestorage.com"],
      APP_MEDIA_KEY: key,
    }).run();
    const [first, second] = fakeFetch.mock.calls;
    expect(/** @type {any} */ (first)?.[1]?.headers).toEqual({ "X-Media-Key": key });
    expect(String(second?.[0])).toBe("https://bucket.acc.r2.cloudflarestorage.com/a.jpg?sig=1");
    expect(/** @type {any} */ (second)?.[1]?.headers).toBeUndefined();
    expect((await imported(doc._id))?.evidenceIds).toHaveLength(1);
  });

  it("refuses a redirect to a host that isn't allowed", async () => {
    fakeFetch.mockImplementationOnce(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://evil.example.com/a.jpg" },
        }),
    );
    const doc = await appReport();
    await importer().run();
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect((await imported(doc._id))?.flags).toEqual(["evidence_download_failed"]);
  });

  it("refuses files that aren't photos, videos or audio", async () => {
    fakeFetch.mockImplementationOnce(async () => new Response("<html>not a photo</html>"));
    const doc = await appReport();
    await importer().run();
    const r = await imported(doc._id);
    expect(r?.flags).toEqual(["evidence_download_failed"]);
    expect(r?.evidenceIds).toHaveLength(0);
  });
});

describe("updates and replies", () => {
  it("asks the citizen, takes their answer from the app, and tells them the outcome", async () => {
    const doc = await appReport();
    await importer().run();
    const id = String((await imported(doc._id))?._id);

    const question = "Which direction was the car going?";
    expect((await post(`/reports/${id}/ask`, { question })).status).toBe(200);
    const asked = (await updatesOf(doc._id)).at(-1);
    expect(asked).toMatchObject({ type: "needs_info", question });

    // Someone else's reply is ignored; the reporter's own is applied.
    await db()
      .collection("report_replies")
      .insertMany([
        { reportId: doc._id, userId: "someone-else", answer: "North", createdAt: new Date() },
        {
          reportId: doc._id,
          userId: String(citizenId),
          answer: "Towards Colombo Fort.",
          createdAt: new Date(Date.now() + 1),
        },
      ]);
    expect(await importer().run()).toMatchObject({ replies: 1 });
    const back = await imported(doc._id);
    expect(back).toMatchObject({ status: "pending" });
    expect(back?.triage.replies.map((x) => x.text)).toEqual(["Towards Colombo Fort."]);

    const rejected = await post(`/reports/${id}/reject`, { reasonCode: "vehicle_unidentifiable" });
    expect(rejected.status).toBe(200);
    const last = (await updatesOf(doc._id)).at(-1);
    expect(last).toMatchObject({
      type: "rejected",
      message: "We couldn't identify the vehicle from this report.",
    });
    expect(await db().collection("reports").findOne({ _id: doc._id })).toMatchObject({
      status: "Rejected",
    });
  });

  it("says 'under review' when HQ accepts, and staff can't choose the import-only reason", async () => {
    const doc = await appReport();
    await importer().run();
    const id = String((await imported(doc._id))?._id);
    expect((await post(`/reports/${id}/reject`, { reasonCode: "account_suspended" })).status).toBe(
      400,
    );
    const res = await post(`/reports/${id}/accept`, {
      offenceCodes: ["MTA-157A"],
      vehicleNumber: "WP CAB-4521",
      priority: "P2",
      occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
      lat: 6.9271,
      lng: 79.8612,
    });
    expect(res.status).toBe(200);
    expect((await updatesOf(doc._id)).at(-1)).toMatchObject({ type: "under_review" });
  });

  it("staff-recorded reports never write to the app's collections", async () => {
    const before = await db().collection("report_updates").countDocuments();
    const res = await post("/reports", {
      channel: "whatsapp",
      reporter: { kind: "named", name: "Saman", phone: "0771234567" },
      occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
      address: "Kandy",
      vehicleNumber: "CP CAB-1234",
      offenceCodes: ["MTA-157A"],
      description: "Driver without a seat belt in Kandy.",
    });
    expect(res.status).toBe(201);
    await post(`/reports/${res.body.id}/reject`, { reasonCode: "insufficient_evidence" });
    expect(await db().collection("report_updates").countDocuments()).toBe(before);
  });

  it("keeps the audit chain intact", async () => {
    expect(await verifyAuditChain()).toBeNull();
  });
});

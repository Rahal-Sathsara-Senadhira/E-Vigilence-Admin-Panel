// Evidence — docs/10 §3: originals kept with fingerprints, viewing copies,
// chain of custody, access rules.

import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EvidenceService } from "../src/modules/evidence/evidence.service";
import { ffmpegPath, makeTestVideo } from "../src/modules/evidence/media";
import { publishPublicSchedule, seedOffenceSchedule } from "../src/modules/offences/schedule.data";
import { bearer, createStaff, createStation, createTestApp, signIn, type TestApp } from "./helpers";

// A real 1×1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

let t: TestApp;
let evidence: EvidenceService;
let hq: string;
let officer: string;
let otherOfficer: string;
let kandyOfficer: string;

const upload = (token: string, body: Buffer, fileName = "photo.png") =>
  t
    .http()
    .post(`/api/v1/evidence?fileName=${encodeURIComponent(fileName)}`)
    .set(bearer(token))
    .set("Content-Type", "application/octet-stream")
    .send(body);

const walkIn = (evidenceIds: string[]) => ({
  channel: "walk_in",
  reporter: { kind: "named", name: "Kamal Perera", phone: "0771112233" },
  occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
  location: { lat: 6.9344, lng: 79.8428 },
  address: "York Street, Colombo 01",
  vehicleNumber: "WP KX-2020",
  vehicleType: "motorcycle",
  offenceCodes: ["MTA-158"],
  description: "Rider and pillion without helmets on York Street.",
  evidenceIds,
});

beforeAll(async () => {
  t = await createTestApp();
  await seedOffenceSchedule(t.conn, true);
  await publishPublicSchedule(t.conn);
  evidence = t.app.get(EvidenceService);
  const fort = await createStation(t, "Fort");
  const kandy = await createStation(t, "Kandy");
  hq = (await signIn(t, await createStaff(t, { role: "hq" }))).token;
  officer = (await signIn(t, await createStaff(t, { role: "station_officer", stationId: fort })))
    .token;
  otherOfficer = (await signIn(t, await createStaff(t, { role: "station_oic", stationId: fort })))
    .token;
  kandyOfficer = (
    await signIn(t, await createStaff(t, { role: "station_officer", stationId: kandy }))
  ).token;
});
afterAll(() => t.close());

describe("receiving files", () => {
  it("fingerprints the original and uses it as the viewing copy for photos", async () => {
    const res = await upload(officer, PNG);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      kind: "photo",
      status: "ready",
      original: { size: PNG.length, mime: "image/png", sha256: sha256(PNG), retained: true },
      viewing: { mime: "image/png", compressed: false },
      reportId: null,
    });
  });

  it("checks the real type from the content, not the file name", async () => {
    const fake = await upload(
      officer,
      Buffer.from("this is not really a picture at all"),
      "car.jpg",
    );
    expect(fake.status).toBe(415);
    expect(fake.body.error.code).toBe("unsupported_file");
  });

  it("refuses photos over 25 MB", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(26 * 1024 * 1024)]);
    const res = await upload(officer, big, "huge.png");
    expect(res.status).toBe(413);
  });

  it("keeps an unattached upload private to its uploader", async () => {
    const res = await upload(officer, PNG);
    expect(
      (await t.http().get(`/api/v1/evidence/${res.body.id}`).set(bearer(otherOfficer))).status,
    ).toBe(404);
    expect(
      (await t.http().get(`/api/v1/evidence/${res.body.id}`).set(bearer(officer))).status,
    ).toBe(200);
  });
});

describe("attaching to reports", () => {
  it("attaches the recorder's own uploads, once, and logs custody", async () => {
    const file = (await upload(officer, PNG)).body;
    const report = await t
      .http()
      .post("/api/v1/reports")
      .set(bearer(officer))
      .send(walkIn([file.id]));
    expect(report.status).toBe(201);
    expect(report.body.evidenceCount).toBe(1);

    const again = await t
      .http()
      .post("/api/v1/reports")
      .set(bearer(officer))
      .send(walkIn([file.id]));
    expect(again.body.error.fields.evidenceIds).toBeDefined();

    const custody = await t.http().get(`/api/v1/evidence/${file.id}/custody`).set(bearer(hq));
    expect(custody.body.map((c: { event: string }) => c.event)).toEqual(["received", "attached"]);
    expect(custody.body[0].detail).toContain(sha256(PNG));
  });

  it("refuses someone else's upload", async () => {
    const file = (await upload(otherOfficer, PNG)).body;
    const res = await t
      .http()
      .post("/api/v1/reports")
      .set(bearer(officer))
      .send(walkIn([file.id]));
    expect(res.status).toBe(400);
    // Nothing was created: the report's transaction rolled back.
    const still = await t.http().get(`/api/v1/evidence/${file.id}`).set(bearer(otherOfficer));
    expect(still.body.reportId).toBeNull();
  });
});

describe("viewing and originals", () => {
  let fileId: string;

  beforeAll(async () => {
    fileId = (await upload(officer, PNG)).body.id;
    await t
      .http()
      .post("/api/v1/reports")
      .set(bearer(officer))
      .send(walkIn([fileId]));
  });

  it("serves the viewing copy to HQ and the station, not to other stations", async () => {
    const view = await t
      .http()
      .get(`/api/v1/evidence/${fileId}/view`)
      .set(bearer(hq))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(view.status).toBe(200);
    expect(sha256(view.body as Buffer)).toBe(sha256(PNG));
    expect(
      (await t.http().get(`/api/v1/evidence/${fileId}/view`).set(bearer(otherOfficer))).status,
    ).toBe(200);
    expect(
      (await t.http().get(`/api/v1/evidence/${fileId}/view`).set(bearer(kandyOfficer))).status,
    ).toBe(404);
  });

  it("opens the original for HQ only, with a reason, and logs it (D10-1)", async () => {
    expect(
      (
        await t
          .http()
          .post(`/api/v1/evidence/${fileId}/original`)
          .set(bearer(officer))
          .send({ reason: "Checking it" })
      ).status,
    ).toBe(403);
    expect(
      (await t.http().post(`/api/v1/evidence/${fileId}/original`).set(bearer(hq)).send({})).status,
    ).toBe(400);

    const res = await t
      .http()
      .post(`/api/v1/evidence/${fileId}/original`)
      .set(bearer(hq))
      .send({ reason: "Preparing the court bundle" })
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(sha256(res.body as Buffer)).toBe(sha256(PNG));

    const custody = await t.http().get(`/api/v1/evidence/${fileId}/custody`).set(bearer(hq));
    expect(custody.body.at(-1)).toMatchObject({
      event: "original_accessed",
      reason: "Preparing the court bundle",
    });
    expect(
      await t.conn
        .collection("audit_log")
        .findOne({ action: "evidence.original_accessed", "target.id": fileId }),
    ).not.toBeNull();
  });
});

describe("video", () => {
  it.skipIf(!ffmpegPath())(
    "keeps the original and makes a compressed viewing copy",
    async () => {
      const path = join(tmpdir(), `ev-test-${Date.now()}.mp4`);
      await makeTestVideo(path, 1);
      const bytes = await readFile(path);
      await rm(path, { force: true });

      const res = await upload(officer, bytes, "dashcam.mp4");
      expect(res.body).toMatchObject({ kind: "video", status: "processing", viewing: null });
      await evidence.whenIdle();

      const done = await t.http().get(`/api/v1/evidence/${res.body.id}`).set(bearer(officer));
      expect(done.body).toMatchObject({
        status: "ready",
        original: { sha256: sha256(bytes), size: bytes.length },
        viewing: { mime: "video/mp4", compressed: true },
      });
      const custody = await t
        .http()
        .get(`/api/v1/evidence/${res.body.id}/custody`)
        .set(bearer(officer));
      expect(custody.body.map((c: { event: string }) => c.event)).toEqual([
        "received",
        "processed",
      ]);
    },
    120_000,
  );
});

describe("time limits", () => {
  it("deletes uploads never attached within a day", async () => {
    const file = (await upload(officer, PNG)).body;
    const removed = await evidence.deleteUnclaimed(new Date(Date.now() + 2 * 86_400_000));
    expect(removed).toBeGreaterThanOrEqual(1);
    expect((await t.http().get(`/api/v1/evidence/${file.id}`).set(bearer(officer))).status).toBe(
      404,
    );
    const custody = await t.conn.collection("custody_events").findOne({ event: "deleted" });
    expect(custody).not.toBeNull();
  });
});

// Evidence — docs/10 §3: originals kept with their fingerprint, content
// checked, custody recorded, originals opened only with a reason.

import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifyAuditChain } from "#src/core/audit/audit.js";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { OffenceVersion } from "#src/modules/offences/offences.model.js";
import { Station } from "#src/modules/organisation/organisation.model.js";
import { CSRF, createTestApp, createUser, signInAs } from "./helpers/app.js";

/** @type {Awaited<ReturnType<typeof createTestApp>>} */
let t;
/** @type {string} */ let hqToken;
/** @type {any} */ let kandy;

/** A small but real JPEG: the JPEG signature and some bytes. */
const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(2048, 7),
  Buffer.from([0xff, 0xd9]),
]);
const sha = (/** @type {Buffer} */ b) => createHash("sha256").update(b).digest("hex");

/** @param {string} token @param {string} reportId @param {Buffer} bytes @param {string} name */
const upload = (token, reportId, bytes, name) =>
  t
    .http()
    .post(`/api/v1/reports/${reportId}/evidence`)
    .set(CSRF)
    .set("Authorization", `Bearer ${token}`)
    .attach("file", bytes, name);

/** @param {string} token */
async function newReport(token) {
  const res = await t
    .http()
    .post("/api/v1/reports")
    .set(CSRF)
    .set("Authorization", `Bearer ${token}`)
    .send({
      channel: "whatsapp",
      reporter: { kind: "named", name: "Saman Kumara", phone: "0771234567" },
      occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
      address: "Kandy",
      vehicleNumber: "CP CAB-1234",
      offenceCodes: ["MTA-157A"],
      description: "No seat belt, photo sent on WhatsApp.",
    });
  return res.body;
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
  [kandy] = await Station.create([{ name: "Kandy Police Station", code: "KANDY", verified: true }]);
  hqToken = await signInAs(t, await createUser({ role: "hq_operator" }));
});
afterAll(() => t.close());
beforeEach(() => signInLimiter.reset());

describe("evidence", () => {
  it("stores the original as received, with its fingerprint", async () => {
    const r = await newReport(hqToken);
    const res = await upload(hqToken, r.id, jpeg, "photo.jpg");
    expect(res.status).toBe(201);
    expect(res.body.evidence).toHaveLength(1);
    expect(res.body.evidence[0]).toMatchObject({
      kind: "photo",
      mime: "image/jpeg",
      size: jpeg.length,
      sha256: sha(jpeg),
    });

    const view = await t
      .http()
      .get(`/api/v1/evidence/${res.body.evidence[0].id}/view`)
      .set("Authorization", `Bearer ${hqToken}`)
      .buffer(true)
      .parse((r2, cb) => {
        /** @type {Buffer[]} */ const chunks = [];
        r2.on("data", (c) => chunks.push(c));
        r2.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(view.headers["content-type"]).toBe("image/jpeg");
    expect(view.headers["cache-control"]).toBe("private, no-store");
    expect(sha(view.body)).toBe(sha(jpeg));
  });

  it("judges files by their content, not their name", async () => {
    const r = await newReport(hqToken);
    const fake = await upload(
      hqToken,
      r.id,
      Buffer.from("this is just text pretending to be a photo"),
      "photo.jpg",
    );
    expect(fake.status).toBe(400);
    expect(fake.body.error.fields.file).toMatch(/photo, video or audio/);
  });

  it("refuses a photo over 25 MB, and stores nothing", async () => {
    const r = await newReport(hqToken);
    const big = Buffer.concat([jpeg.subarray(0, 4), Buffer.alloc(26 * 1024 * 1024, 1)]);
    const res = await upload(hqToken, r.id, big, "big.jpg");
    expect(res.status).toBe(413);
    expect(res.body.error.message).toMatch(/Photos can be up to 25 MB/);
    const after = await t
      .http()
      .get(`/api/v1/reports/${r.id}`)
      .set("Authorization", `Bearer ${hqToken}`);
    expect(after.body.evidence).toHaveLength(0);
  });

  it("opening the original needs a reason, recorded in the custody log", async () => {
    const r = await newReport(hqToken);
    const item = (await upload(hqToken, r.id, jpeg, "photo.jpg")).body.evidence[0];
    const noReason = await t
      .http()
      .get(`/api/v1/evidence/${item.id}/original`)
      .set("Authorization", `Bearer ${hqToken}`);
    expect(noReason.status).toBe(400);
    const ok = await t
      .http()
      .get(
        `/api/v1/evidence/${item.id}/original?reason=${encodeURIComponent("Preparing the court bundle")}`,
      )
      .set("Authorization", `Bearer ${hqToken}`);
    expect(ok.status).toBe(200);
    expect(ok.headers["content-disposition"]).toMatch(/^attachment/);
    const details = await t
      .http()
      .get(`/api/v1/evidence/${item.id}`)
      .set("Authorization", `Bearer ${hqToken}`);
    expect(details.body.custody.map((/** @type {any} */ c) => c.event)).toEqual([
      "received",
      "original_opened",
    ]);
    expect(details.body.custody[1].note).toBe("Preparing the court bundle");
  });

  it("other stations can't see it; officers can't open originals yet", async () => {
    const clerk = await signInAs(
      t,
      await createUser({ role: "station_clerk", stationId: kandy._id }),
    );
    const r = (
      await t
        .http()
        .post("/api/v1/reports")
        .set(CSRF)
        .set("Authorization", `Bearer ${clerk}`)
        .send({
          channel: "walk_in",
          reporter: { kind: "anonymous" },
          occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
          address: "Kandy",
          vehicleNumber: "CP CAB-9999",
          offenceCodes: ["MTA-157A"],
          description: "Walk-in with a phone video.",
        })
    ).body;
    const item = (await upload(clerk, r.id, jpeg, "walkin.jpg")).body.evidence[0];
    const galleOfficer = await signInAs(t, await createUser({ role: "traffic_officer" }));
    expect(
      (
        await t
          .http()
          .get(`/api/v1/evidence/${item.id}/view`)
          .set("Authorization", `Bearer ${galleOfficer}`)
      ).status,
    ).toBe(404);
    const kandyOfficer = await signInAs(
      t,
      await createUser({ role: "traffic_officer", stationId: kandy._id }),
    );
    expect(
      (
        await t
          .http()
          .get(`/api/v1/evidence/${item.id}/view`)
          .set("Authorization", `Bearer ${kandyOfficer}`)
      ).status,
    ).toBe(200);
    expect(
      (
        await t
          .http()
          .get(`/api/v1/evidence/${item.id}/original?reason=checking`)
          .set("Authorization", `Bearer ${kandyOfficer}`)
      ).status,
    ).toBe(403);
  });

  it("every upload and opening is audited", async () => {
    expect(await verifyAuditChain()).toBeNull();
  });
});

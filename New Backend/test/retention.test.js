// Data retention — docs/10 §6, §5.5: off until HQ turns it on after the
// legal review; preview; rejected reports and closed cases anonymised with
// their evidence files deleted; legal hold; the audit trail; and a citizen
// deleting their app account.

import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditEntry } from "#src/core/audit/audit.js";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { Case } from "#src/modules/cases/index.js";
import { Evidence } from "#src/modules/evidence/index.js";
import { Notice } from "#src/modules/notices/notice.model.js";
import { OffenceVersion } from "#src/modules/offences/offences.model.js";
import { Division, Station } from "#src/modules/organisation/organisation.model.js";
import { Person } from "#src/modules/registers/registers.model.js";
import { receiveFromApp } from "#src/modules/reports/index.js";
import { Report } from "#src/modules/reports/report.model.js";
import { ReporterAccount } from "#src/modules/reporters/index.js";
import {
  importAccountDeletions,
  runMonthlyRetention,
} from "#src/modules/retention/retention.service.js";
import { RewardEntry } from "#src/modules/rewards/reward.model.js";
import { CSRF, createTestApp, createUser, signInAs } from "./helpers/app.js";

/** @type {Awaited<ReturnType<typeof createTestApp>>} */
let t;
/** @type {Record<string, ReturnType<typeof as>>} */
const u = {};
/** @type {Record<string, string>} */
const tokens = {};
const DAY = 86_400_000;
const YEAR = 365.25 * DAY;
let seq = 0;

/** @param {string} token */
const as = (token) => ({
  get: (/** @type {string} */ p) =>
    t.http().get(`/api/v1${p}`).set("Authorization", `Bearer ${token}`),
  post: (/** @type {string} */ p, /** @type {object} */ b = {}) =>
    t.http().post(`/api/v1${p}`).set(CSRF).set("Authorization", `Bearer ${token}`).send(b),
  put: (/** @type {string} */ p, /** @type {object} */ b = {}) =>
    t.http().put(`/api/v1${p}`).set(CSRF).set("Authorization", `Bearer ${token}`).send(b),
});

/** A report HQ records, with one stored evidence file. */
async function reportWithEvidence() {
  seq += 1;
  const r = await u.hq?.post("/reports", {
    channel: "whatsapp",
    reporter: { kind: "named", name: "Saman Kumara", phone: "0771234567" },
    occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
    lat: 7.2936,
    lng: 80.6413,
    address: "12 Temple Road, Kandy",
    vehicleNumber: `CP RT-${String(1000 + seq)}`,
    offenceCodes: ["MTA-A"],
    description: "Driver seen committing the offence near the school.",
  });
  const key = `evidence/test-${seq}.jpg`;
  const tmp = path.join(os.tmpdir(), `ev-retention-${seq}.jpg`);
  await writeFile(tmp, "jpeg bytes");
  await t.storage.putFile(key, tmp, "image/jpeg");
  const [e] = await Evidence.create([
    {
      kind: "photo",
      mime: "image/jpeg",
      size: 10,
      sha256: "a".repeat(64),
      originalKey: key,
      viewKey: key,
      reportId: r?.body.id,
      receivedVia: "whatsapp",
      uploadedBy: { name: "HQ" },
    },
  ]);
  await Report.updateOne({ _id: r?.body.id }, { $set: { evidenceIds: [e?._id] } });
  return { reportId: String(r?.body.id), evidenceId: String(e?._id), key };
}

/** Moves a record's clock back, without touching its timestamps again. @param {any} model @param {any} id @param {object} set */
const backdate = (model, id, set) =>
  model.collection.updateOne({ _id: new mongoose.Types.ObjectId(String(id)) }, { $set: set });

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
  const [div] = await Division.create([{ name: "Kandy", code: "KANDY" }]);
  const [kandy] = await Station.create(
    /** @type {any[]} */ ([
      {
        name: "Kandy Police Station",
        code: "KDY",
        divisionId: div?._id,
        verified: true,
        location: { type: "Point", coordinates: [80.6337, 7.2906] },
      },
    ]),
  );
  const accounts = {
    hq: await createUser({ role: "hq_operator" }),
    admin: await createUser({ role: "hq_admin" }),
    officer: await createUser({ role: "traffic_officer", stationId: kandy?._id }),
    oic: await createUser({ role: "station_oic", stationId: kandy?._id }),
  };
  for (const [k, user] of Object.entries(accounts)) {
    tokens[k] = await signInAs(t, user);
    u[k] = as(tokens[k]);
  }
});
afterAll(() => t.close());
beforeEach(() => signInLimiter.reset());

describe("the switch (§6, D10-8)", () => {
  it("is off: HQ can preview, but nothing is deleted until it is turned on", async () => {
    const { reportId } = await reportWithEvidence();
    await u.hq?.post(`/reports/${reportId}/reject`, { reasonCode: "not_an_offence" });
    await backdate(Report, reportId, { "triage.decidedAt": new Date(Date.now() - 1.2 * YEAR) });

    expect((await u.hq?.get("/retention"))?.status).toBe(403);
    const view = (await u.admin?.get("/retention"))?.body;
    expect(view.enabled).toBe(false);
    const rule = view.preview.rules.find((/** @type {any} */ r) => r.key === "rejected_reports");
    expect(rule.due).toBe(1);
    expect((await u.admin?.post("/retention/run"))?.status).toBe(409);
    expect(await runMonthlyRetention()).toBeNull();
    expect((await Report.findById(reportId).lean())?.description).toMatch(/near the school/);
  });
});

describe("the schedule (§6)", () => {
  it("a rejected report a year on: its evidence files go, its personal data too; the run is audited", async () => {
    const turnedOn = await u.admin?.put("/retention/settings", {
      enabled: true,
      reason: "Schedule confirmed by the legal advisers.",
    });
    expect(turnedOn?.body.enabled).toBe(true);
    const { reportId, evidenceId, key } = await reportWithEvidence();
    await u.hq?.post(`/reports/${reportId}/reject`, { reasonCode: "not_an_offence" });
    await backdate(Report, reportId, { "triage.decidedAt": new Date(Date.now() - 1.5 * YEAR) });

    const run = await u.admin?.post("/retention/run");
    expect(run?.status).toBe(200);
    expect(
      run?.body.runs[0].results.find((/** @type {any} */ r) => r.rule === "rejected_reports").done,
    ).toBe(2);

    const r = await Report.findById(reportId).lean();
    expect(r).toMatchObject({
      status: "rejected",
      description: "(Removed at the end of the retention period.)",
      reporter: { name: null, phone: null },
      vehicleNumber: null,
      offenceCodes: ["MTA-A"],
      retention: { rule: "rejected_reports" },
    });
    const e = await Evidence.findById(evidenceId).lean();
    expect(e?.deletedAt).toBeTruthy();
    expect(e?.sha256).toBe("a".repeat(64));
    expect(e?.custody.at(-1)).toMatchObject({ event: "deleted" });
    await expect(t.storage.get(key)).rejects.toThrow();
    expect((await u.hq?.get(`/evidence/${evidenceId}/view`))?.status).toBe(410);
    expect(
      await AuditEntry.exists({ action: "retention.applied", "target.id": reportId }),
    ).toBeTruthy();
  });

  it("a closed no-action case two years on: anonymised, and its people once nothing else needs them", async () => {
    const { reportId } = await reportWithEvidence();
    const acc = await u.hq?.post(`/reports/${reportId}/accept`, {
      offenceCodes: ["MTA-A"],
      vehicleNumber: `CP RT-${String(1000 + seq)}`,
      priority: "P2",
      occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
      lat: 7.2936,
      lng: 80.6413,
    });
    const caseId = String(acc?.body.case.id);
    const person = await Person.create({
      type: "individual",
      name: "Nimal Perera",
      nic: "198012345678",
      address: "3 Lake Road, Kandy",
      createdBy: "test",
    });
    const closed = new Date(Date.now() - 2.5 * YEAR);
    await backdate(Case, caseId, {
      status: "closed",
      owner: { id: person._id, name: person.name },
      timeline: [{ at: closed, event: "closed", by: "test", note: null }],
      updatedAt: closed,
    });

    await u.admin?.post("/retention/run");
    const c = await Case.findById(caseId).lean();
    expect(c).toMatchObject({ owner: null, retention: { rule: "nfa_cases" } });
    expect(c?.facts.offenceCodes).toEqual(["MTA-A"]);
    expect((await Report.findById(reportId).lean())?.reporter.name).toBeNull();
    expect(await Person.findById(person._id).lean()).toMatchObject({
      name: "Removed",
      nic: null,
      address: null,
      anonymisedAt: expect.any(Date),
    });
  });

  it("legal hold: a case with a disputed notice is left alone, whatever its age", async () => {
    const { reportId } = await reportWithEvidence();
    const acc = await u.hq?.post(`/reports/${reportId}/accept`, {
      offenceCodes: ["MTA-A"],
      vehicleNumber: `CP RT-${String(1000 + seq)}`,
      priority: "P2",
      occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
      lat: 7.2936,
      lng: 80.6413,
    });
    const caseId = String(acc?.body.case.id);
    const closed = new Date(Date.now() - 8 * YEAR);
    await backdate(Case, caseId, {
      status: "closed",
      decision: { outcome: { outcome: "penalty_notice" } },
      timeline: [{ at: closed, event: "closed", by: "test", note: null }],
      updatedAt: closed,
    });
    await Notice.collection.insertOne({
      noticeNumber: "PN-2018-000001",
      kind: "penalty",
      status: "disputed",
      caseId: new mongoose.Types.ObjectId(caseId),
      caseNumber: "TC-2018-000001",
      addressee: { personId: new mongoose.Types.ObjectId(), name: "Kamal", address: "Galle" },
    });

    const view = (await u.admin?.get("/retention"))?.body;
    const rule = view.preview.rules.find((/** @type {any} */ r) => r.key === "enforced_cases");
    expect(rule.heldSample[0]).toMatchObject({ reason: "PN-2018-000001 is disputed" });
    await u.admin?.post("/retention/run");
    expect((await Case.findById(caseId).lean())?.retention).toBeNull();
  });
});

describe("a citizen deletes their app account (§5.5)", () => {
  it("reports stay under an anonymous token, unpaid points lapse, and it happens once", async () => {
    const userId = String(new mongoose.Types.ObjectId());
    const r = await receiveFromApp(
      {
        appReportId: new mongoose.Types.ObjectId(),
        clientReportId: null,
        userId,
        reporterName: "Citizen Fernando",
        reporterPhone: "0771112223",
        receivedAt: new Date(),
        occurredAt: new Date(Date.now() - 3_600_000),
        location: { lat: 7.2936, lng: 80.6413 },
        address: "Kandy",
        vehicleNumber: "CP RT-9999",
        vehicleType: null,
        vehicleDescription: null,
        offenceCodes: ["MTA-A"],
        description: "Seen on the Kandy road.",
        injuries: false,
        priority: "P2",
        flags: [],
        rejection: null,
      },
      [],
    );
    await RewardEntry.create({
      userId,
      kind: "award",
      reportId: r?.id,
      reportNumber: r?.reportNumber,
      caseId: new mongoose.Types.ObjectId(),
      caseNumber: "TC-2026-999998",
      basePoints: 10,
      share: 100,
      points: 10,
      status: "pending",
    });
    await ReporterAccount.create({ userId });
    await mongoose.connection.db
      ?.collection("account_deletions")
      .insertOne({ userId, deletedAt: new Date() });

    expect(await importAccountDeletions()).toBe(1);
    const report = await Report.findById(r?.id).lean();
    expect(report?.source?.userId).toMatch(/^deleted-[0-9a-f]{16}$/);
    expect(report?.reporter).toMatchObject({ name: null, phone: null });
    expect(await RewardEntry.findOne({ reportId: r?.id }).lean()).toMatchObject({
      status: "expired",
      userId: report?.source?.userId,
    });
    expect(await ReporterAccount.exists({ userId })).toBeNull();
    expect(await importAccountDeletions()).toBe(0);
  });
});

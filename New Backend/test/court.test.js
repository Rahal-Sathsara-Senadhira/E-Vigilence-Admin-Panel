// Court cases — docs/06: courts and station defaults, opening from a
// decision or a notice, prepare → approve → file → hearings → verdict →
// confirm, separation of duties, payment before filing, the evidence
// bundle, appeals and withdrawal.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditEntry, verifyAuditChain } from "#src/core/audit/audit.js";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { Case } from "#src/modules/cases/index.js";
import { CourtCase } from "#src/modules/court/court.model.js";
import { runNoticeSweep } from "#src/modules/notices/index.js";
import { Notice } from "#src/modules/notices/notice.model.js";
import { OffenceVersion } from "#src/modules/offences/offences.model.js";
import { Division, Station } from "#src/modules/organisation/organisation.model.js";
import { paymentLookupLimiter } from "#src/modules/payments/payments.service.js";
import { CSRF, createTestApp, createUser, signInAs } from "./helpers/app.js";

/** @type {Awaited<ReturnType<typeof createTestApp>>} */
let t;
/** @type {Record<string, ReturnType<typeof as>>} */
const u = {};
/** @type {any} */ let kandy;
/** @type {string} */ let courtId;
const DAY = 86_400_000;
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

/** @param {string} code @param {"spot_fine" | "court"} outcome */
const offence = (code, outcome) => ({
  code,
  version: 1,
  name: `Offence ${code}`,
  legalReference: `s. ${code}`,
  outcome,
  spotFine: outcome === "spot_fine" ? 2000 : null,
  severity: outcome === "court" ? "severe" : "minor",
  citizenReportable: true,
  publicName: code,
  publicDescription: "A test offence description.",
  active: true,
  effectiveFrom: new Date(Date.now() - DAY),
  current: true,
  source: "test",
  changedBy: "test",
  reason: "test",
});

/**
 * A Kandy case, investigated by the officer and decided by the OIC.
 * @param {"court" | "penalty_notice"} outcome
 */
async function decided(outcome) {
  seq += 1;
  const plate = `CP CT-${String(4000 + seq)}`;
  const offences = outcome === "court" ? ["MTA-COURT"] : ["MTA-FINE"];
  const occurredAt = new Date(Date.now() - 3_600_000).toISOString();
  const r = await u.hq?.post("/reports", {
    channel: "whatsapp",
    reporter: { kind: "named", name: "Saman Kumara", phone: "0771234567" },
    occurredAt,
    lat: 7.2936,
    lng: 80.6413,
    address: "Kandy",
    vehicleNumber: plate,
    offenceCodes: offences,
    description: "Driver seen committing the offence.",
  });
  const acc = await u.hq?.post(`/reports/${r?.body.id}/accept`, {
    offenceCodes: offences,
    vehicleNumber: plate,
    priority: "P2",
    occurredAt,
    lat: 7.2936,
    lng: 80.6413,
  });
  const caseId = acc?.body.case.id;
  await u.officer?.post(`/cases/${caseId}/accept`);
  const nic = `${String(400000000 + seq)}V`;
  const person = await u.officer?.post("/persons", {
    type: "individual",
    name: `Accused ${seq}`,
    nic,
    address: "3 Court Road, Kandy",
  });
  await u.officer?.post(`/cases/${caseId}/trace`, {
    ownerId: person?.body.id,
    ownerFrom: new Date(Date.now() - 400 * DAY).toISOString(),
    dmtReference: `DMT/${seq}`,
    checkedOn: new Date().toISOString(),
  });
  await u.officer?.put(`/cases/${caseId}/review`, {
    plateReadable: true,
    vehicleMatches: true,
    timePlaceConsistent: true,
    noEditing: true,
    offenceVisible: true,
  });
  const rec = await u.officer?.post(`/cases/${caseId}/recommend`, {
    outcome,
    addressee: "owner",
    justification: "Clear evidence of the offence.",
    ...(outcome === "court"
      ? { prosecutionSummary: "Driver raced on the highway; video evidence." }
      : {}),
  });
  expect(rec?.status).toBe(200);
  expect((await u.oic?.post(`/cases/${caseId}/decide`, { action: "approve" }))?.status).toBe(200);
  return { caseId: String(caseId), nic, plate };
}

/** The court case opened for a case. @param {string} caseId */
const courtCaseOf = async (caseId) => String((await CourtCase.findOne({ caseId }).lean())?._id);

/** Takes a referred court case to "filed". @param {string} id */
async function toFiled(id) {
  await u.officer?.post(`/court-cases/${id}/prepare`, {
    courtId,
    summary: "The accused raced on the highway; dashcam video attached.",
  });
  await u.oic?.post(`/court-cases/${id}/approve`);
  return u.officer?.post(`/court-cases/${id}/file`, {
    courtCaseNumber: `MC/KDY/${seq}/2026`,
    firstHearing: new Date(Date.now() + 10 * DAY).toISOString(),
  });
}

beforeAll(async () => {
  t = await createTestApp();
  await OffenceVersion.create(
    /** @type {any[]} */ ([offence("MTA-FINE", "spot_fine"), offence("MTA-COURT", "court")]),
  );
  const [div] = await Division.create([{ name: "Kandy", code: "KANDY" }]);
  [kandy] = await Station.create(
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
    supervisor: await createUser({ role: "hq_supervisor" }),
    admin: await createUser({ role: "hq_admin" }),
    officer: await createUser({ role: "traffic_officer", stationId: kandy._id }),
    oic: await createUser({ role: "station_oic", stationId: kandy._id }),
    clerk: await createUser({ role: "station_clerk", stationId: kandy._id }),
    division: await createUser({ role: "division_supervisor", divisionId: div?._id }),
  };
  for (const [k, user] of Object.entries(accounts)) u[k] = as(await signInAs(t, user));
});
afterAll(() => t.close());
beforeEach(() => {
  signInLimiter.reset();
  paymentLookupLimiter.reset();
});

describe("courts (D06-1)", () => {
  it("HQ administrators keep the list and each station's default court", async () => {
    expect(
      (await u.officer?.post("/courts", { name: "Kandy Magistrate's Court", code: "MC-KDY" }))
        ?.status,
    ).toBe(403);
    const created = await u.admin?.post("/courts", {
      name: "Kandy Magistrate's Court",
      code: "mc-kdy",
      district: "Kandy",
    });
    expect(created?.status).toBe(201);
    courtId = created?.body.items[0].id;
    expect((await u.admin?.post("/courts", { name: "Another", code: "MC-KDY" }))?.status).toBe(400);
    expect((await u.admin?.put(`/courts/stations/${kandy._id}`, { courtId }))?.status).toBe(200);
    expect(
      (await u.officer?.get("/courts"))?.body.items.map((/** @type {any} */ c) => c.code),
    ).toEqual(["MC-KDY"]);
  });
});

describe("the court path", () => {
  it("a 'court referral' decision opens a court case with the charges, the accused and the station's court", async () => {
    const { caseId } = await decided("court");
    const id = await courtCaseOf(caseId);
    const cc = await u.officer?.get(`/court-cases/${id}`);
    expect(cc?.body).toMatchObject({
      courtRef: expect.stringMatching(/^CR-\d{4}-\d{6}$/),
      status: "referred",
      route: "court_offence",
      court: { name: "Kandy Magistrate's Court" },
      charges: [{ code: "MTA-COURT", legalReference: "s. MTA-COURT" }],
      accused: { address: "3 Court Road, Kandy" },
      next: { kind: "prepare" },
      can: { prepare: true, approve: false },
    });
    expect(
      (await u.oic?.get("/court-cases?view=to_prepare"))?.body.items.map(
        (/** @type {any} */ x) => x.id,
      ),
    ).toContain(id);
  });

  it("prepare → OIC approves → file → hearings → verdict → OIC confirms; the case closes", async () => {
    const { caseId } = await decided("court");
    const id = await courtCaseOf(caseId);
    expect(
      (await u.officer?.post(`/court-cases/${id}/prepare`, { courtId, summary: "Too short" }))
        ?.status,
    ).toBe(400);
    const filed = await toFiled(id);
    expect(filed?.body).toMatchObject({ status: "filed", next: { kind: "hearing" } });

    // Five postponements flag the case to HQ (docs/06 §9).
    for (let i = 1; i <= 5; i += 1) {
      await u.officer?.post(`/court-cases/${id}/hearings`, {
        outcome: "postponed",
        notes: "Accused's lawyer absent.",
        nextDate: new Date(Date.now() + (10 + i * 7) * DAY).toISOString(),
      });
    }
    const flagged = await u.supervisor?.get(`/court-cases?view=flagged`);
    expect(flagged?.body.items.map((/** @type {any} */ x) => x.id)).toContain(id);
    expect(
      (await u.officer?.post(`/court-cases/${id}/hearings`, { outcome: "heard" }))?.status,
    ).toBe(400);

    const v = await u.officer?.post(`/court-cases/${id}/verdict`, {
      result: "convicted",
      date: new Date().toISOString(),
      sentence: "Fine",
      fineAmount: 25000,
      fineReceiptNumber: "MC-RCPT-881",
    });
    expect(v?.body).toMatchObject({
      status: "verdict",
      verdict: { result: "convicted", fineAmount: 25000 },
    });
    expect((await u.officer?.post(`/court-cases/${id}/verdict/confirm`))?.status).toBe(403);
    const confirmed = await u.oic?.post(`/court-cases/${id}/verdict/confirm`);
    expect(confirmed?.body).toMatchObject({
      status: "closed",
      verdict: { confirmedBy: expect.any(String) },
    });
    expect((await Case.findById(caseId).lean())?.status).toBe("closed");

    // An appeal can change the verdict (D06-7).
    await u.officer?.post(`/court-cases/${id}/appeal`, {
      reference: "HC/APP/12/2026",
      filedAt: new Date().toISOString(),
    });
    const appeal = await u.oic?.post(`/court-cases/${id}/appeal/result`, {
      result: "changed",
      newVerdict: "acquitted",
    });
    expect(appeal?.body).toMatchObject({
      verdict: { result: "acquitted" },
      appeal: { result: "changed" },
    });
  });

  it("whoever prepared it can't approve filing; whoever recorded the verdict can't confirm it", async () => {
    const { caseId } = await decided("court");
    const id = await courtCaseOf(caseId);
    await u.oic?.post(`/court-cases/${id}/prepare`, {
      courtId,
      summary: "Prepared by the OIC: dashcam video and owner's statement.",
    });
    const self = await u.oic?.post(`/court-cases/${id}/approve`);
    expect(self?.status).toBe(403);
    expect((await u.division?.post(`/court-cases/${id}/approve`))?.body.status).toBe("approved");
    await u.oic?.post(`/court-cases/${id}/file`, {
      courtCaseNumber: "MC/KDY/OIC/2026",
      firstHearing: new Date().toISOString(),
    });
    // A guilty plea records the conviction in one step.
    const plea = await u.oic?.post(`/court-cases/${id}/hearings`, {
      outcome: "guilty_plea",
      fineAmount: 10000,
    });
    expect(plea?.body).toMatchObject({ status: "verdict", verdict: { result: "convicted" } });
    expect((await u.oic?.post(`/court-cases/${id}/verdict/confirm`))?.status).toBe(403);
    expect((await u.division?.post(`/court-cases/${id}/verdict/confirm`))?.body.status).toBe(
      "closed",
    );
  });

  it("the evidence bundle lists every item with its fingerprint, and is logged", async () => {
    const { caseId } = await decided("court");
    const id = await courtCaseOf(caseId);
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(900, 4),
      Buffer.from([0xff, 0xd9]),
    ]);
    const token = (await signInAs(t, await createUser({ role: "hq_operator" }))) ?? "";
    const report = (await Case.findById(caseId).lean())?.reportIds[0];
    await t
      .http()
      .post(`/api/v1/reports/${report}/evidence`)
      .set(CSRF)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", jpeg, "photo.jpg");
    const bundle = await u.officer?.get(`/court-cases/${id}/bundle`);
    expect(bundle?.body.items).toEqual([
      expect.objectContaining({
        no: 1,
        kind: "photo",
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    ]);
    expect(
      await AuditEntry.countDocuments({ action: "court.bundle_generated", "target.id": id }),
    ).toBe(1);
  });

  it("withdrawn before filing, with a reason; the case closes", async () => {
    const { caseId } = await decided("court");
    const id = await courtCaseOf(caseId);
    expect(
      (
        await u.officer?.post(`/court-cases/${id}/withdraw`, {
          reason: "The accused died last week.",
        })
      )?.status,
    ).toBe(403);
    const res = await u.oic?.post(`/court-cases/${id}/withdraw`, {
      reason: "The accused died last week.",
    });
    expect(res?.body.status).toBe("withdrawn");
    expect((await Case.findById(caseId).lean())?.status).toBe("closed");
  });
});

describe("from an unpaid notice", () => {
  /** A penalty notice served, overdue past the final date, court proposed and confirmed. */
  async function referredNotice() {
    const d = await decided("penalty_notice");
    const n = await Notice.findOne({ caseId: d.caseId }).lean();
    await u.clerk?.post(`/notices/${n?._id}/posted`, {});
    await Notice.updateOne({ _id: n?._id }, { $set: { dueDate: new Date(Date.now() - DAY) } });
    await runNoticeSweep();
    await Notice.updateOne(
      { _id: n?._id },
      { $set: { finalDueDate: new Date(Date.now() - 60_000) } },
    );
    await runNoticeSweep();
    await u.oic?.post(`/notices/${n?._id}/court`, { note: "No response after the reminder." });
    return { ...d, noticeId: String(n?._id), noticeNumber: String(n?.noticeNumber) };
  }

  it("the confirmed referral opens a court case; paying before filing withdraws it", async () => {
    const n = await referredNotice();
    const cc = await CourtCase.findOne({ noticeId: n.noticeId }).lean();
    expect(cc).toMatchObject({
      route: "unpaid_notice",
      status: "referred",
      noticeNumber: n.noticeNumber,
    });

    const pay = await t
      .http()
      .post("/api/v1/public/payments/start")
      .set(CSRF)
      .send({ noticeNumber: n.noticeNumber, idNumber: n.nic });
    expect(pay.status).toBe(201);
    await t
      .http()
      .post(`/api/v1/public/payments/sim/${pay.body.sessionId}/outcome`)
      .set(CSRF)
      .send({ method: "card", outcome: "success" });
    expect((await Notice.findById(n.noticeId).lean())?.status).toBe("paid");
    expect((await CourtCase.findById(cc?._id).lean())?.status).toBe("withdrawn");
  });

  it("after filing, the notice can no longer be paid here", async () => {
    const n = await referredNotice();
    const id = String((await CourtCase.findOne({ noticeId: n.noticeId }).lean())?._id);
    expect((await toFiled(id))?.body.status).toBe("filed");
    const pay = await t
      .http()
      .post("/api/v1/public/payments/start")
      .set(CSRF)
      .send({ noticeNumber: n.noticeNumber, idNumber: n.nic });
    expect(pay.status).toBe(409);
    expect(pay.body.error.message).toMatch(/court/);
  });

  it("keeps the audit chain intact", async () => {
    expect(await verifyAuditChain()).toBeNull();
  });
});

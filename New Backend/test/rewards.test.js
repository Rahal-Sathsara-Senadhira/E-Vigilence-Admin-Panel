// Citizen rewards — docs/16: points on the decision (lead, added evidence,
// duplicate), confirmed by payment, warnings, eligibility and fraud checks,
// holds released by HQ supervisors, reversals, fabricated evidence, the
// rules and the expiry of unpaid points.

import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { Notice } from "#src/modules/notices/notice.model.js";
import { OffenceVersion } from "#src/modules/offences/offences.model.js";
import { Division, Station } from "#src/modules/organisation/organisation.model.js";
import { paymentLookupLimiter } from "#src/modules/payments/payments.service.js";
import { receiveFromApp } from "#src/modules/reports/index.js";
import { Report } from "#src/modules/reports/report.model.js";
import { ReporterAccount } from "#src/modules/reporters/index.js";
import { runRewardSweep } from "#src/modules/rewards/index.js";
import { RewardEntry } from "#src/modules/rewards/reward.model.js";
import { CSRF, createTestApp, createUser, signInAs } from "./helpers/app.js";

/** @type {Awaited<ReturnType<typeof createTestApp>>} */
let t;
/** @type {Record<string, ReturnType<typeof as>>} */
const u = {};
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
const pub = {
  post: (/** @type {string} */ p, /** @type {object} */ b = {}) =>
    t.http().post(`/api/v1/public/payments${p}`).set(CSRF).send(b),
};

/**
 * A citizen of the app: verified and adult unless told otherwise.
 * @param {{ verified?: boolean, phone?: string }} [o]
 */
async function citizen(o = {}) {
  seq += 1;
  const _id = new mongoose.Types.ObjectId();
  await mongoose.connection.db?.collection("users").insertOne({
    _id,
    name: `Citizen ${seq}`,
    phone: o.phone ?? `07${String(10000000 + seq)}`,
    phoneVerified: o.verified ?? true,
    nicVerified: o.verified ?? true,
    nic: `19${String(8000000000 + seq)}`,
    dateOfBirth: new Date("1990-05-01"),
  });
  return String(_id);
}

/**
 * A report from the app, as the import makes it.
 * @param {string} userId @param {string} plate @param {{ evidence?: boolean, at?: Date }} [o]
 */
async function appReport(userId, plate, o = {}) {
  const r = await receiveFromApp(
    {
      appReportId: new mongoose.Types.ObjectId(),
      clientReportId: null,
      userId,
      reporterName: "Citizen",
      reporterPhone: null,
      receivedAt: o.at ?? new Date(),
      occurredAt: new Date(Date.now() - 3_600_000),
      location: { lat: 7.2936, lng: 80.6413 },
      address: "Kandy",
      vehicleNumber: plate,
      vehicleType: null,
      vehicleDescription: null,
      offenceCodes: ["MTA-SEV"],
      description: "Seen on the Kandy road.",
      injuries: false,
      priority: "P2",
      flags: [],
      rejection: null,
    },
    [],
  );
  const id = String(r?.id);
  // Usable evidence is what makes a lead report (§5); only the count matters here.
  if (o.evidence !== false)
    await Report.updateOne({ _id: id }, { $set: { evidenceIds: [new mongoose.Types.ObjectId()] } });
  return id;
}

/**
 * Accepts the first report, merges the others, and takes the case to a
 * decision. Returns the case and its notice.
 * @param {string[]} reportIds @param {string} plate
 * @param {{ outcome?: "penalty_notice" | "warning", ownerPhone?: string }} [o]
 */
async function decided(reportIds, plate, o = {}) {
  const [first, ...rest] = reportIds;
  const occurredAt = new Date(Date.now() - 3_600_000).toISOString();
  const acc = await u.hq?.post(`/reports/${first}/accept`, {
    // Warnings are for minor offences only (docs/05 §7).
    offenceCodes: o.outcome === "warning" ? ["MTA-MIN"] : ["MTA-SEV", "MTA-MIN"],
    vehicleNumber: plate,
    priority: "P2",
    occurredAt,
    lat: 7.2936,
    lng: 80.6413,
  });
  expect(acc?.status).toBe(200);
  const caseId = String(acc?.body.case.id);
  for (const id of rest)
    expect((await u.hq?.post(`/reports/${id}/merge`, { caseId }))?.status).toBe(200);
  await u.officer?.post(`/cases/${caseId}/accept`);
  const nic = `${String(600000000 + seq)}V`;
  const person = await u.officer?.post("/persons", {
    type: "individual",
    name: `Owner ${seq}`,
    nic,
    address: "12 Hill Street, Kandy",
    phone: o.ownerPhone ?? "0777000000",
  });
  await u.officer?.post(`/cases/${caseId}/trace`, {
    ownerId: person?.body.id,
    ownerFrom: new Date(Date.now() - 400 * DAY).toISOString(),
    dmtReference: `DMT/R${seq}`,
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
    outcome: o.outcome ?? "penalty_notice",
    addressee: "owner",
    justification: "Clear evidence of the offence.",
  });
  expect(rec?.status).toBe(200);
  expect((await u.oic?.post(`/cases/${caseId}/decide`, { action: "approve" }))?.status).toBe(200);
  const n = await Notice.findOne({ caseId }).lean();
  return { caseId, noticeId: String(n?._id), noticeNumber: String(n?.noticeNumber), nic };
}

/** @param {string} reportId */
const entryOf = (reportId) => RewardEntry.findOne({ reportId, kind: "award" }).lean();
/** The latest reward line the citizen sees on a report. @param {string} reportId */
async function lineOn(reportId) {
  const r = await Report.findById(reportId).lean();
  const rows = await mongoose.connection.db
    ?.collection("report_updates")
    .find({ reportId: r?.source?.appReportId, type: "reward" })
    .sort({ at: -1 })
    .toArray();
  return rows?.[0]?.message ?? null;
}
const plate = () => `CP RW-${String(6000 + (seq += 1))}`;

beforeAll(async () => {
  t = await createTestApp();
  const offence = (/** @type {string} */ code, /** @type {string} */ severity) => ({
    code,
    version: 1,
    name: `Offence ${code}`,
    legalReference: `s. ${code}`,
    outcome: "spot_fine",
    spotFine: 2000,
    severity,
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
  await OffenceVersion.create(
    /** @type {any[]} */ ([offence("MTA-SEV", "severe"), offence("MTA-MIN", "minor")]),
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
    supervisor: await createUser({ role: "hq_supervisor" }),
    admin: await createUser({ role: "hq_admin" }),
    finance: await createUser({ role: "finance_officer" }),
    officer: await createUser({ role: "traffic_officer", stationId: kandy?._id }),
    oic: await createUser({ role: "station_oic", stationId: kandy?._id }),
    clerk: await createUser({ role: "station_clerk", stationId: kandy?._id }),
  };
  for (const [k, user] of Object.entries(accounts)) u[k] = as(await signInAs(t, user));
});
afterAll(() => t.close());
beforeEach(() => {
  signInLimiter.reset();
  paymentLookupLimiter.reset();
});

describe("earning (§4, §5)", () => {
  it("the lead report earns the highest offence in full, added evidence a quarter, a duplicate nothing", async () => {
    const p = plate();
    const [a, b, c] = [await citizen(), await citizen(), await citizen()];
    const lead = await appReport(a, p, { at: new Date(Date.now() - 30 * 60_000) });
    const added = await appReport(b, p, { at: new Date(Date.now() - 20 * 60_000) });
    const dup = await appReport(c, p, { evidence: false, at: new Date(Date.now() - 10 * 60_000) });
    const n = await decided([lead, added, dup], p);

    expect(await entryOf(lead)).toMatchObject({ points: 50, share: 100, status: "pending" });
    expect(await entryOf(added)).toMatchObject({ points: 13, share: 25, status: "pending" });
    expect(await entryOf(dup)).toMatchObject({ points: 0, share: 0, status: "not_eligible" });
    expect(await lineOn(lead)).toMatch(/^50 reward points pending/);
    expect(await lineOn(dup)).toMatch(/Another report of this incident came first/);
    expect((await ReporterAccount.findOne({ userId: a }).lean())?.balance?.pending).toBe(50);

    // Paying the notice confirms them (D16-2).
    await u.clerk?.post(`/notices/${n.noticeId}/posted`, {});
    const start = await pub.post("/start", { noticeNumber: n.noticeNumber, idNumber: n.nic });
    expect(start.status).toBe(201);
    await pub.post(`/sim/${start.body.sessionId}/outcome`, { method: "card", outcome: "success" });
    const confirmed = await entryOf(lead);
    expect(confirmed).toMatchObject({ status: "confirmed" });
    expect(confirmed?.expiresAt?.getTime()).toBeGreaterThan(Date.now() + 300 * DAY);
    expect(await lineOn(lead)).toMatch(/^50 reward points confirmed/);
    expect((await ReporterAccount.findOne({ userId: a }).lean())?.balance).toMatchObject({
      pending: 0,
      available: 50,
    });
  });

  it("a warning's points are confirmed at once (D16-4)", async () => {
    const p = plate();
    const r = await appReport(await citizen(), p);
    await decided([r], p, { outcome: "warning" });
    expect(await entryOf(r)).toMatchObject({ points: 5, status: "confirmed" });
  });
});

describe("eligibility and fraud checks (§3, §7)", () => {
  it("an unverified citizen can't earn; a self-report can't earn and flags the reporter", async () => {
    const p1 = plate();
    const unverified = await appReport(await citizen({ verified: false }), p1);
    await decided([unverified], p1);
    expect(await entryOf(unverified)).toMatchObject({ status: "not_eligible", points: 0 });
    expect(await lineOn(unverified)).toMatch(/Verify your phone and NIC/);

    const p2 = plate();
    const owner = await citizen({ phone: "0779998887" });
    const self = await appReport(owner, p2);
    await decided([self], p2, { ownerPhone: "077 999 8887" });
    expect(await entryOf(self)).toMatchObject({ status: "not_eligible" });
    expect(await lineOn(self)).toBe("This report can't earn a reward.");
    expect((await ReporterAccount.findOne({ userId: owner }).lean())?.status).toBe("flagged");
  });

  it("targeting a plate holds the reward until an HQ supervisor releases it", async () => {
    const p = plate();
    const who = await citizen();
    await appReport(who, p, { at: new Date(Date.now() - 3 * DAY) });
    await appReport(who, p, { at: new Date(Date.now() - 2 * DAY) });
    const r = await appReport(who, p);
    await decided([r], p);
    const held = await entryOf(r);
    expect(held?.hold?.reason).toMatch(/Possible targeting: 3 reports/);
    expect(await lineOn(r)).toBe("Your reward is being checked before it can be confirmed.");

    const list = await u.finance?.get("/rewards?view=held");
    expect(list?.body.items.map((/** @type {any} */ e) => e.reportNumber)).toContain(
      held?.reportNumber,
    );
    const why = { reason: "Checked: different incidents on different days." };
    expect((await u.finance?.post(`/rewards/${held?._id}/release`, why))?.status).toBe(403);
    const released = await u.supervisor?.post(`/rewards/${held?._id}/release`, why);
    expect(released?.body).toMatchObject({ status: "pending", hold: null });
    expect(await lineOn(r)).toMatch(/^50 reward points pending/);
  });
});

describe("reversals (§4, §7)", () => {
  it("withdrawing the notice reverses pending points", async () => {
    const p = plate();
    const r = await appReport(await citizen(), p);
    const n = await decided([r], p);
    await u.supervisor?.post(`/notices/${n.noticeId}/withdraw`, {
      reason: "Withdrawn after the station found a mistake.",
    });
    expect(await entryOf(r)).toMatchObject({ status: "reversed" });
    expect(await lineOn(r)).toBe("The case outcome changed, so this reward was reversed.");
  });

  it("fabricated evidence cancels pending points and freezes payouts; a second time excludes", async () => {
    const p = plate();
    const who = await citizen();
    const good = await appReport(who, p);
    await decided([good], p);
    expect(await entryOf(good)).toMatchObject({ status: "pending" });

    const fake = await appReport(who, plate());
    expect(
      (await u.hq?.post(`/reports/${fake}/reject`, { reasonCode: "fabricated" }))?.status,
    ).toBe(200);
    expect(await entryOf(good)).toMatchObject({ status: "reversed" });
    const account = await ReporterAccount.findOne({ userId: who }).lean();
    expect(account?.rewards).toMatchObject({ frozen: true, excluded: false, fabricatedCount: 1 });
    // Flagging stays with the triage rule: three false reports in 90 days (docs/02 §10).
    expect(account?.status).toBe("active");

    const again = await appReport(who, plate());
    await u.hq?.post(`/reports/${again}/reject`, { reasonCode: "fabricated" });
    expect((await ReporterAccount.findOne({ userId: who }).lean())?.rewards?.excluded).toBe(true);
  });
});

describe("rules and expiry (§6)", () => {
  it("HQ administrators change the rules for cases decided after", async () => {
    const body = {
      severityPoints: { minor: 10, moderate: 20, severe: 60 },
      offencePoints: [],
      warningPoints: 5,
      rupeesPer100Points: 1000,
      minPayoutPoints: 100,
      monthlyCapRupees: 10000,
      dailyEarningReports: 10,
      reason: "Severe offences need more encouragement.",
    };
    expect((await u.supervisor?.put("/rewards/rules", body))?.status).toBe(403);
    const changed = await u.admin?.put("/rewards/rules", body);
    expect(changed?.body.current.severityPoints.severe).toBe(60);
    expect((await u.admin?.put("/rewards/rules", body))?.status).toBe(409);

    const p = plate();
    const r = await appReport(await citizen(), p);
    await decided([r], p);
    expect(await entryOf(r)).toMatchObject({ points: 60 });
  });

  it("unpaid confirmed points lapse at their expiry; the citizen is warned 30 days before", async () => {
    const p = plate();
    const r = await appReport(await citizen(), p);
    await decided([r], p, { outcome: "warning" });
    await RewardEntry.updateOne(
      { reportId: r, kind: "award" },
      { $set: { expiresAt: new Date(Date.now() + 10 * DAY) } },
    );
    expect((await runRewardSweep()).warned).toBeGreaterThanOrEqual(1);
    expect(await lineOn(r)).toMatch(/expire on/);
    expect((await runRewardSweep(new Date(Date.now() + 11 * DAY))).expired).toBeGreaterThanOrEqual(
      1,
    );
    expect(await entryOf(r)).toMatchObject({ status: "expired" });
  });
});

// Demerit points — docs/08: off by default (D08-1), recorded when a notice
// is paid (the sum of its offences, D08-2), shown on the notice and the
// payment page, thresholds that tell the station and HQ (§7), the DMT
// referral, organisations (§5), removal on refund (§4), and expiry (D08-4).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inTransaction } from "#src/core/db/connection.js";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { DemeritEntry, DemeritStanding } from "#src/modules/demerit/demerit.model.js";
import {
  recordForNotice,
  refreshStanding,
  runDemeritSweep,
} from "#src/modules/demerit/demerit.service.js";
import { Notice } from "#src/modules/notices/notice.model.js";
import { Notification } from "#src/modules/notifications/notification.model.js";
import { OffenceVersion } from "#src/modules/offences/offences.model.js";
import { Division, Station } from "#src/modules/organisation/organisation.model.js";
import { Payment } from "#src/modules/payments/payment.model.js";
import { paymentLookupLimiter } from "#src/modules/payments/payments.service.js";
import { CSRF, createTestApp, createUser, signInAs } from "./helpers/app.js";

/** @type {Awaited<ReturnType<typeof createTestApp>>} */
let t;
/** @type {Record<string, ReturnType<typeof as>>} */
const u = {};
/** @type {Record<string, any>} */
const users = {};
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
    t.http().post(`/api/v1/public/${p}`).set(CSRF).send(b),
};

/** A posted notice for a new owner, ready to pay. */
async function servedNotice() {
  seq += 1;
  const plate = `SP DM-${String(3000 + seq)}`;
  const nic = `${String(700000000 + seq)}V`;
  const occurredAt = new Date(Date.now() - 3_600_000).toISOString();
  const r = await u.hq?.post("/reports", {
    channel: "whatsapp",
    reporter: { kind: "named", name: "Saman Kumara", phone: "0771234567" },
    occurredAt,
    lat: 7.2936,
    lng: 80.6413,
    address: "Kandy",
    vehicleNumber: plate,
    offenceCodes: ["MTA-A", "MTA-B"],
    description: "Driver seen committing the offences.",
  });
  const acc = await u.hq?.post(`/reports/${r?.body.id}/accept`, {
    offenceCodes: ["MTA-A", "MTA-B"],
    vehicleNumber: plate,
    priority: "P2",
    occurredAt,
    lat: 7.2936,
    lng: 80.6413,
  });
  const caseId = acc?.body.case.id;
  await u.officer?.post(`/cases/${caseId}/accept`);
  const person = await u.officer?.post("/persons", {
    type: "individual",
    name: `Driver ${seq}`,
    nic,
    address: "12 Hill Street, Kandy",
  });
  await u.officer?.post(`/cases/${caseId}/trace`, {
    ownerId: person?.body.id,
    ownerFrom: new Date(Date.now() - 400 * DAY).toISOString(),
    dmtReference: `DMT/D${seq}`,
    checkedOn: new Date().toISOString(),
  });
  await t
    .http()
    .put(`/api/v1/cases/${caseId}/review`)
    .set(CSRF)
    .set("Authorization", `Bearer ${tokens.officer}`)
    .send({
      plateReadable: true,
      vehicleMatches: true,
      timePlaceConsistent: true,
      noEditing: true,
      offenceVisible: true,
    });
  await u.officer?.post(`/cases/${caseId}/recommend`, {
    outcome: "penalty_notice",
    addressee: "owner",
    justification: "Clear evidence of both offences.",
  });
  await u.oic?.post(`/cases/${caseId}/decide`, { action: "approve" });
  const n = await Notice.findOne({ caseId }).lean();
  await u.clerk?.post(`/notices/${n?._id}/posted`, {});
  return {
    noticeId: String(n?._id),
    noticeNumber: String(n?.noticeNumber),
    personId: String(person?.body.id),
    nic,
    plate,
  };
}

/** Pays a notice online through the simulator. @param {{ noticeNumber: string, nic: string }} n */
async function pay(n) {
  const start = await pub.post("payments/start", { noticeNumber: n.noticeNumber, idNumber: n.nic });
  expect(start.status).toBe(201);
  await pub.post(`payments/sim/${start.body.sessionId}/outcome`, {
    method: "card",
    outcome: "success",
  });
}

/** @param {object} body */
const setScheme = (body) =>
  u.admin?.put("/demerit/settings", { reason: "Scheme in force from today.", ...body });

/** @type {Record<string, string>} */
const tokens = {};

beforeAll(async () => {
  t = await createTestApp();
  await OffenceVersion.create(
    /** @type {any[]} */ (
      [
        ["MTA-A", 1000, 3],
        ["MTA-B", 2500, 4],
      ].map(([code, fine, points]) => ({
        code,
        version: 1,
        name: `Offence ${code}`,
        legalReference: `s. ${code}`,
        outcome: "spot_fine",
        spotFine: fine,
        severity: "minor",
        demeritPoints: points,
        citizenReportable: true,
        publicName: code,
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
  Object.assign(users, {
    hq: await createUser({ role: "hq_operator" }),
    supervisor: await createUser({ role: "hq_supervisor" }),
    admin: await createUser({ role: "hq_admin" }),
    finance: await createUser({ role: "finance_officer" }),
    officer: await createUser({ role: "traffic_officer", stationId: kandy?._id }),
    oic: await createUser({ role: "station_oic", stationId: kandy?._id }),
    clerk: await createUser({ role: "station_clerk", stationId: kandy?._id }),
  });
  for (const [k, user] of Object.entries(users)) {
    tokens[k] = await signInAs(t, user);
    u[k] = as(tokens[k]);
  }
});
afterAll(() => t.close());
beforeEach(() => {
  signInLimiter.reset();
  paymentLookupLimiter.reset();
});

describe("the switch (§2)", () => {
  it("is off by default: a paid notice records nothing", async () => {
    expect((await u.officer?.get("/demerit/settings"))?.body.current).toEqual({
      enabled: false,
      warnAt: 16,
      referAt: 24,
    });
    const n = await servedNotice();
    await pay(n);
    expect(await DemeritEntry.countDocuments({ personId: n.personId })).toBe(0);
  });

  it("only HQ administrators change it, with sensible thresholds", async () => {
    expect(
      (
        await u.supervisor?.put("/demerit/settings", {
          enabled: true,
          warnAt: 16,
          referAt: 24,
          reason: "Scheme in force.",
        })
      )?.status,
    ).toBe(403);
    expect((await setScheme({ enabled: true, warnAt: 24, referAt: 16 }))?.status).toBe(400);
    expect((await setScheme({ enabled: true, warnAt: 8, referAt: 12 }))?.body.current).toEqual({
      enabled: true,
      warnAt: 8,
      referAt: 12,
    });
  });
});

describe("recording (§4–§7)", () => {
  it("a paid notice records the sum of its offences on the payer, expiring 24 months after the offence", async () => {
    const n = await servedNotice();
    expect((await u.oic?.get(`/notices/${n.noticeId}`))?.body.demeritPoints).toBe(7);
    const lookup = await pub.post("notices/lookup", {
      noticeNumber: n.noticeNumber,
      plate: n.plate,
    });
    expect(lookup.body.demeritPoints).toBe(7);
    await pay(n);
    const [entry] = await DemeritEntry.find({ personId: n.personId }).lean();
    expect(entry).toMatchObject({
      points: 7,
      offenceCodes: ["MTA-A", "MTA-B"],
      recordedBy: "system",
    });
    const months = (entry.expiresAt.getTime() - entry.offenceDate.getTime()) / (30.44 * DAY);
    expect(Math.round(months)).toBe(24);
    const points = (await u.oic?.get(`/demerit/persons/${n.personId}`))?.body;
    expect(points).toMatchObject({ enabled: true, total: 7, flag: "none" });
  });

  it("crossing the thresholds tells the station, then HQ, who records the referral", async () => {
    const first = await servedNotice();
    await pay(first);
    // A second notice for the same person (8+ points: the warning).
    await DemeritEntry.updateMany({ personId: first.personId }, { $set: { points: 9 } });
    const again = await inTransaction(async (s) => {
      return refreshStanding(
        s,
        first.personId,
        (await Notice.findById(first.noticeId).lean())?.stationId,
      );
    });
    expect(again.flag).toBe("approaching");
    expect(
      await Notification.exists({ userId: users.oic._id, kind: "demerit.approaching" }),
    ).toBeTruthy();

    await DemeritEntry.updateMany({ personId: first.personId }, { $set: { points: 13 } });
    await inTransaction(async (s) => {
      return refreshStanding(s, first.personId, null);
    });
    expect(
      await Notification.exists({ userId: users.supervisor._id, kind: "demerit.threshold" }),
    ).toBeTruthy();
    const list = (await u.supervisor?.get("/demerit/standings"))?.body.items;
    expect(list.map((/** @type {any} */ x) => x.personId)).toContain(first.personId);

    const referral = { reference: "DMT/REF/2026/0001", referredOn: new Date().toISOString() };
    expect(
      (await u.admin?.post(`/demerit/persons/${first.personId}/referral`, referral))?.status,
    ).toBe(403);
    const done = await u.supervisor?.post(`/demerit/persons/${first.personId}/referral`, referral);
    expect(done?.body.referral).toMatchObject({ reference: "DMT/REF/2026/0001" });
    expect(
      (await u.supervisor?.post(`/demerit/persons/${first.personId}/referral`, referral))?.status,
    ).toBe(409);
  });

  it("an organisation that pays without naming a driver gets no points, and HQ is told", async () => {
    const n = await servedNotice();
    await Notice.updateOne(
      { _id: n.noticeId },
      { $set: { "addressee.type": "organisation", status: "paid" } },
    );
    expect(await inTransaction((s) => recordForNotice(s, n.noticeId, "system"))).toBeNull();
    expect(
      await Notification.exists({
        userId: users.supervisor._id,
        kind: "demerit.organisation_paid",
      }),
    ).toBeTruthy();
  });
});

describe("removal and expiry (§4, D08-4)", () => {
  it("a refund after withdrawal removes the points", async () => {
    const n = await servedNotice();
    await pay(n);
    expect((await DemeritStanding.findOne({ personId: n.personId }).lean())?.total).toBe(7);
    await u.supervisor?.post(`/notices/${n.noticeId}/withdraw`, {
      reason: "Withdrawn after HQ found the camera clock was wrong.",
    });
    const p = await Payment.findOne({
      noticeNumber: n.noticeNumber,
      "refund.status": "due",
    }).lean();
    expect((await u.finance?.post(`/payments/${p?._id}/refund`))?.status).toBe(200);
    const entries = await DemeritEntry.find({ personId: n.personId })
      .sort({ recordedAt: 1 })
      .lean();
    expect(entries.map((e) => e.points)).toEqual([7, -7]);
    expect(entries[1]?.reason).toBe("Refunded");
    expect((await DemeritStanding.findOne({ personId: n.personId }).lean())?.total).toBe(0);
  });

  it("points expire 24 months after the offence", async () => {
    const n = await servedNotice();
    await pay(n);
    await DemeritEntry.updateMany(
      { personId: n.personId },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    expect(await runDemeritSweep()).toBeGreaterThanOrEqual(1);
    expect((await DemeritStanding.findOne({ personId: n.personId }).lean())?.total).toBe(0);
  });
});

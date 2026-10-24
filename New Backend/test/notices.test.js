// Penalty notices and warning letters — docs/05 §5–§7: issued on the
// decision with fines from the schedule, posted and deemed served, returned
// mail and re-serving, overdue reminders and the court proposal, HQ
// withdrawal and override, warning letters closing the case.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifyAuditChain } from "#src/core/audit/audit.js";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { Case } from "#src/modules/cases/index.js";
import { runNoticeSweep } from "#src/modules/notices/index.js";
import { publicLookupLimiter, publicRespondLimiter } from "#src/modules/notices/notices.routes.js";
import { Notice, OutboxMessage } from "#src/modules/notices/notice.model.js";
import { OffenceVersion } from "#src/modules/offences/offences.model.js";
import { Station } from "#src/modules/organisation/organisation.model.js";
import { Person } from "#src/modules/registers/registers.model.js";
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

/** @param {string} code @param {number} fine */
const offence = (code, fine) => ({
  code,
  version: 1,
  name: `Offence ${code}`,
  legalReference: `s. ${code}`,
  outcome: "spot_fine",
  spotFine: fine,
  severity: "minor",
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
 * A Kandy case decided with `outcome` (default: a penalty notice to the
 * owner for two offences); returns the case and its notice.
 * @param {{ outcome?: "penalty_notice" | "warning" }} [o]
 */
async function decidedCase(o = {}) {
  seq += 1;
  const plate = `CP KA-${String(2000 + seq)}`;
  const offences = ["MTA-A", "MTA-B"];
  const occurredAt = new Date(Date.now() - 3_600_000).toISOString();
  const r = await u.hq?.post("/reports", {
    channel: "whatsapp",
    reporter: { kind: "named", name: "Saman Kumara", phone: "0771234567" },
    occurredAt,
    lat: 7.2936,
    lng: 80.6413,
    address: "Dalada Veediya, Kandy",
    vehicleNumber: plate,
    offenceCodes: offences,
    description: "Driver seen committing the offences.",
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
  const person = await u.officer?.post("/persons", {
    type: "individual",
    name: `Owner ${seq}`,
    nic: `${String(600000000 + seq)}V`,
    address: "12 Hill Street, Kandy",
    phone: "0771112233",
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
    outcome: o.outcome ?? "penalty_notice",
    addressee: "owner",
    justification: "Clear evidence of both offences.",
  });
  expect(rec?.status).toBe(200);
  const decided = await u.oic?.post(`/cases/${caseId}/decide`, { action: "approve" });
  expect(decided?.status).toBe(200);
  const notice = await Notice.findOne({ caseId }).lean();
  return {
    caseId: /** @type {string} */ (caseId),
    personId: /** @type {string} */ (person?.body.id),
    noticeId: String(notice?._id),
    plate,
  };
}

beforeAll(async () => {
  t = await createTestApp();
  await OffenceVersion.create(
    /** @type {any[]} */ ([offence("MTA-A", 1000), offence("MTA-B", 2500)]),
  );
  const [kandy, galle] = await Station.create(
    /** @type {any[]} */ ([
      {
        name: "Kandy Police Station",
        code: "KDY",
        verified: true,
        location: { type: "Point", coordinates: [80.6337, 7.2906] },
      },
      {
        name: "Galle Police Station",
        code: "GLE",
        verified: true,
        location: { type: "Point", coordinates: [80.217, 6.0328] },
      },
    ]),
  );
  const accounts = {
    hq: await createUser({ role: "hq_operator" }),
    supervisor: await createUser({ role: "hq_supervisor" }),
    officer: await createUser({ role: "traffic_officer", stationId: kandy?._id }),
    oic: await createUser({ role: "station_oic", stationId: kandy?._id }),
    clerk: await createUser({ role: "station_clerk", stationId: kandy?._id }),
    galleClerk: await createUser({ role: "station_clerk", stationId: galle?._id }),
  };
  for (const [k, user] of Object.entries(accounts)) u[k] = as(await signInAs(t, user));
});
afterAll(() => t.close());
beforeEach(() => {
  signInLimiter.reset();
  publicLookupLimiter.reset();
  publicRespondLimiter.reset();
});

describe("issuing and serving", () => {
  it("issues the notice on the decision, with the fines from the schedule", async () => {
    const { noticeId, caseId } = await decidedCase();
    const res = await u.clerk?.get(`/notices/${noticeId}`);
    expect(res?.body).toMatchObject({
      noticeNumber: expect.stringMatching(/^PN-\d{4}-\d{6}$/),
      kind: "penalty",
      status: "issued",
      amount: 3500,
      offences: [
        { code: "MTA-A", fine: 1000, legalReference: "s. MTA-A" },
        { code: "MTA-B", fine: 2500 },
      ],
      addresseeDetail: { role: "owner", address: "12 Hill Street, Kandy" },
      next: { kind: "post" },
      can: { post: true, withdraw: false },
    });
    expect(
      (await u.clerk?.get("/notices?view=to_post"))?.body.items.map((/** @type {any} */ n) => n.id),
    ).toContain(noticeId);
    // HQ operators see the notice, not the person (docs/10 §5.3).
    expect((await u.hq?.get(`/notices/${noticeId}`))?.body.addresseeDetail).toMatchObject({
      name: "Recorded",
      address: "Kandy",
    });
    expect((await u.galleClerk?.get(`/notices/${noticeId}`))?.status).toBe(404);
    expect((await Case.findById(caseId).lean())?.status).toBe("decided");
    // The printed notice: no reporter details, ever.
    const doc = await u.clerk?.get(`/notices/${noticeId}/document`);
    expect(JSON.stringify(doc?.body)).not.toContain("Saman");
    expect(
      await OutboxMessage.countDocuments({ noticeId, channel: "post", status: "queued" }),
    ).toBe(1);
  });

  it("posting serves it 3 days later, with 14 days to respond, and an SMS without details", async () => {
    const { noticeId } = await decidedCase();
    const posted = await u.clerk?.post(`/notices/${noticeId}/posted`, {});
    expect(posted?.body).toMatchObject({ status: "served", next: { kind: "due" } });
    const served = Date.parse(posted?.body.servedAt);
    expect(Math.round((served - Date.now()) / DAY)).toBe(3);
    expect(Math.round((Date.parse(posted?.body.dueDate) - served) / DAY)).toBe(14);
    const sms = await OutboxMessage.findOne({ noticeId, channel: "sms" }).lean();
    expect(sms?.text).toContain(posted?.body.noticeNumber);
    expect(sms?.text).not.toMatch(/MTA|Rs|3500|offence/i);
    expect(await OutboxMessage.countDocuments({ noticeId, channel: "post", status: "sent" })).toBe(
      1,
    );
    expect((await u.clerk?.post(`/notices/${noticeId}/posted`, {}))?.status).toBe(409);
  });

  it("returned mail: re-served at a new address, which is also kept on the person", async () => {
    const { noticeId, personId } = await decidedCase();
    await u.clerk?.post(`/notices/${noticeId}/posted`, {});
    const failed = await u.clerk?.post(`/notices/${noticeId}/service-failed`, {
      note: "Returned: addressee moved.",
    });
    expect(failed?.body).toMatchObject({
      status: "service_failed",
      dueDate: null,
      next: { kind: "reserve" },
    });
    const re = await u.clerk?.post(`/notices/${noticeId}/reserve`, {
      address: "45 Lake Road, Kandy",
      reason: "New address from the Grama Niladhari.",
    });
    expect(re?.body).toMatchObject({
      status: "issued",
      addresseeDetail: { address: "45 Lake Road, Kandy" },
    });
    const person = await Person.findById(personId).lean();
    expect(person).toMatchObject({
      address: "45 Lake Road, Kandy",
      changes: [{ fields: ["address"] }],
    });
    expect((await u.clerk?.post(`/notices/${noticeId}/posted`, {}))?.body.status).toBe("served");
  });
});

describe("due dates", () => {
  it("overdue: a reminder and 7 more days, then court proposed; the OIC confirms", async () => {
    const { noticeId } = await decidedCase();
    await u.clerk?.post(`/notices/${noticeId}/posted`, {});
    await Notice.updateOne({ _id: noticeId }, { $set: { dueDate: new Date(Date.now() - DAY) } });
    expect(await runNoticeSweep()).toMatchObject({ reminded: 1 });
    const overdue = (await u.clerk?.get(`/notices/${noticeId}`))?.body;
    expect(overdue).toMatchObject({
      status: "overdue",
      courtProposed: false,
      next: { kind: "final" },
    });
    expect(await OutboxMessage.countDocuments({ noticeId, kind: "reminder" })).toBe(2);

    await Notice.updateOne(
      { _id: noticeId },
      { $set: { finalDueDate: new Date(Date.now() - 60_000) } },
    );
    expect(await runNoticeSweep()).toMatchObject({ proposed: 1 });
    expect(
      (await u.oic?.get("/notices?view=court_proposed"))?.body.items.map(
        (/** @type {any} */ n) => n.id,
      ),
    ).toContain(noticeId);
    expect(
      (await u.clerk?.post(`/notices/${noticeId}/court`, { note: "No response at all." }))?.status,
    ).toBe(403);
    const court = await u.oic?.post(`/notices/${noticeId}/court`, {
      note: "No response after the reminder.",
    });
    expect(court?.body.status).toBe("court_referral");
    expect(await runNoticeSweep()).toEqual({ reminded: 0, proposed: 0 });
  });
});

describe("HQ and warnings", () => {
  it("HQ supervisors withdraw a notice; the case closes and nothing more goes out", async () => {
    const { noticeId, caseId } = await decidedCase();
    expect(
      (await u.hq?.post(`/notices/${noticeId}/withdraw`, { reason: "Wrong owner traced." }))
        ?.status,
    ).toBe(403);
    const res = await u.supervisor?.post(`/notices/${noticeId}/withdraw`, {
      reason: "The owner sold the vehicle before the offence.",
    });
    expect(res?.body).toMatchObject({
      status: "withdrawn",
      withdrawal: { by: expect.any(String) },
    });
    expect((await Case.findById(caseId).lean())?.status).toBe("closed");
    expect(await OutboxMessage.countDocuments({ noticeId, status: "queued" })).toBe(0);
  });

  it("overriding the decision withdraws the running notice", async () => {
    const { noticeId, caseId } = await decidedCase();
    await u.supervisor?.post(`/cases/${caseId}/override`, {
      reason: "Evidence shows a different vehicle.",
    });
    expect((await Notice.findById(noticeId).lean())?.status).toBe("withdrawn");
    expect((await Case.findById(caseId).lean())?.status).toBe("recommended");
  });

  it("a warning letter is delivered by posting it, and the case closes", async () => {
    const { noticeId, caseId } = await decidedCase({ outcome: "warning" });
    const letter = await u.clerk?.get(`/notices/${noticeId}`);
    expect(letter?.body).toMatchObject({
      noticeNumber: expect.stringMatching(/^WL-/),
      kind: "warning",
      amount: null,
    });
    const posted = await u.clerk?.post(`/notices/${noticeId}/posted`, {});
    expect(posted?.body.status).toBe("closed");
    expect(await Case.findById(caseId).lean()).toMatchObject({ status: "closed" });
  });

  it("keeps the audit chain intact", async () => {
    expect(await verifyAuditChain()).toBeNull();
  });
});

/** The addressee, online: no sign-in. @param {string} p @param {object} b */
const online = (p, b) => t.http().post(`/api/v1/public/notices${p}`).set(CSRF).send(b);
const DRIVER = {
  name: "Kasun Fernando",
  nic: "199234567890",
  address: "8 Temple Road, Kandy",
  phone: "0779998877",
};

describe("online look-up", () => {
  it("needs the right number and plate; shows a masked name and no address", async () => {
    const { noticeId, plate } = await decidedCase();
    const number = (await Notice.findById(noticeId).lean())?.noticeNumber;
    const wrong = await online("/lookup", { noticeNumber: number, plate: "WP ZZZ-9999" });
    const none = await online("/lookup", { noticeNumber: "PN-2026-999999", plate });
    expect(wrong.status).toBe(404);
    expect(none.body.error.message).toBe(wrong.body.error.message);

    const found = await online("/lookup", {
      noticeNumber: number,
      plate: plate.replace(/[ -]/g, "").toLowerCase(),
    });
    expect(found.body).toMatchObject({
      noticeNumber: number,
      amount: 3500,
      addressee: { name: expect.stringMatching(/^O\. \d\*+$/), role: "owner" },
      can: { nominate: false, dispute: false, pay: true },
    });
    expect(JSON.stringify(found.body)).not.toContain("Hill Street");
    await u.clerk?.post(`/notices/${noticeId}/posted`, {});
    expect((await online("/lookup", { noticeNumber: number, plate })).body.can).toMatchObject({
      nominate: true,
      dispute: true,
    });
  });

  it("is rate limited", async () => {
    let last;
    for (let i = 0; i < 21; i += 1)
      last = await online("/lookup", { noticeNumber: "PN-2026-000999", plate: "WP CAB-1234" });
    expect(last?.status).toBe(429);
  });
});

describe("naming the driver", () => {
  it("the owner names the driver once; accepted, the driver gets a new notice and can't pass it on", async () => {
    const { noticeId, plate, caseId } = await decidedCase();
    const number = (await Notice.findById(noticeId).lean())?.noticeNumber;
    await u.clerk?.post(`/notices/${noticeId}/posted`, {});
    expect(
      (
        await online("/nominate", {
          noticeNumber: number,
          plate,
          driver: { name: "X Y", address: "Somewhere far" },
          declaration: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (await online("/nominate", { noticeNumber: number, plate, driver: DRIVER })).status,
    ).toBe(400);
    const named = await online("/nominate", {
      noticeNumber: number,
      plate,
      driver: DRIVER,
      declaration: true,
    });
    expect(named.body.status).toBe("nominated");
    expect(
      (
        await online("/nominate", {
          noticeNumber: number,
          plate,
          driver: DRIVER,
          declaration: true,
        })
      ).status,
    ).toBe(409);

    const queue = await u.officer?.get("/notices?view=nominations");
    expect(queue?.body.items.map((/** @type {any} */ n) => n.id)).toContain(noticeId);
    const accepted = await u.officer?.post(`/notices/${noticeId}/nomination-review`, {
      result: "accepted",
    });
    expect(accepted?.body).toMatchObject({
      status: "issued",
      parentNoticeId: noticeId,
      addresseeDetail: { name: "Kasun Fernando", role: "driver", address: "8 Temple Road, Kandy" },
      amount: 3500,
    });
    expect((await Notice.findById(noticeId).lean())?.status).toBe("transferred");
    expect((await Case.findById(caseId).lean())?.driver).toMatchObject({
      name: "Kasun Fernando",
      basis: "named_by_owner",
    });

    // The driver's notice: they can pay or dispute, not name someone else.
    const childId = accepted?.body.id;
    await u.clerk?.post(`/notices/${childId}/posted`, {});
    const child = await online("/lookup", { noticeNumber: accepted?.body.noticeNumber, plate });
    expect(child.body.can).toMatchObject({ nominate: false, dispute: true });
  });

  it("a driver who can't be identified is rejected; the owner's notice continues", async () => {
    const { noticeId } = await decidedCase();
    await u.clerk?.post(`/notices/${noticeId}/posted`, {});
    await u.clerk?.post(`/notices/${noticeId}/responses`, {
      type: "nomination",
      driver: { ...DRIVER, nic: "199234567891" },
    });
    const rejected = await u.oic?.post(`/notices/${noticeId}/nomination-review`, {
      result: "rejected",
      reason: "No such NIC; the owner gave no other details.",
    });
    expect(rejected?.body).toMatchObject({
      status: "served",
      nomination: { via: "station", review: { result: "rejected" } },
    });
  });
});

describe("disputes", () => {
  it("reviewed by someone other than who decided or served it (S8); rejected gives 7 more days, once", async () => {
    const { noticeId, plate } = await decidedCase();
    const number = (await Notice.findById(noticeId).lean())?.noticeNumber;
    await u.oic?.post(`/notices/${noticeId}/posted`, {});
    const disputed = await online("/dispute", {
      noticeNumber: number,
      plate,
      grounds: "evidence_wrong",
      explanation: "I was in Colombo all day; the photo is not my car.",
      declaration: true,
    });
    expect(disputed.body.status).toBe("disputed");
    // The OIC decided and posted it.
    const oic = await u.oic?.post(`/notices/${noticeId}/dispute-review`, {
      result: "rejected",
      reasons: "The photo clearly shows the plate.",
    });
    expect(oic?.status).toBe(403);
    expect(oic?.body.error.message).toMatch(/S8/);
    const res = await u.supervisor?.post(`/notices/${noticeId}/dispute-review`, {
      result: "rejected",
      reasons: "The photo clearly shows the plate and the car.",
    });
    expect(res?.body).toMatchObject({
      status: "served",
      dispute: { review: { result: "rejected" } },
    });
    expect(Math.round((Date.parse(res?.body.dueDate) - Date.now()) / DAY)).toBe(7);
    expect(
      (
        await online("/dispute", {
          noticeNumber: number,
          plate,
          grounds: "other",
          explanation: "Trying again with more reasons.",
          declaration: true,
        })
      ).status,
    ).toBe(409);
  });

  it("upheld: the notice is withdrawn and the case goes back for a new decision", async () => {
    const { noticeId, caseId } = await decidedCase();
    await u.clerk?.post(`/notices/${noticeId}/posted`, {});
    await u.clerk?.post(`/notices/${noticeId}/responses`, {
      type: "dispute",
      grounds: "sold_or_stolen",
      explanation: "Sold the car a month before; transfer papers attached at the counter.",
    });
    const res = await u.supervisor?.post(`/notices/${noticeId}/dispute-review`, {
      result: "upheld",
      reasons: "Transfer papers show the sale before the offence.",
    });
    expect(res?.body.status).toBe("withdrawn");
    expect((await Case.findById(caseId).lean())?.status).toBe("recommended");
  });

  it("keeps the audit chain intact after responses", async () => {
    expect(await verifyAuditChain()).toBeNull();
  });
});

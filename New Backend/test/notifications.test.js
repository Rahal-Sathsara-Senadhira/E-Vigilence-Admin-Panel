// Time limits and notifications — docs/09: notifications for events (§5.2),
// read and unread, grouping (N2), breaches at the limit and at twice the
// limit (T3, T4) and their resolution, hearing reminders, stations without
// an OIC, and SMS through the gateway (§5.4).

import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inTransaction } from "#src/core/db/connection.js";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { CourtCase } from "#src/modules/court/court.model.js";
import { runSmsDispatch } from "#src/modules/notices/index.js";
import { OutboxMessage } from "#src/modules/notices/notice.model.js";
import { notify, runDeadlineSweep } from "#src/modules/notifications/index.js";
import { Breach, Notification } from "#src/modules/notifications/notification.model.js";
import { OffenceVersion } from "#src/modules/offences/offences.model.js";
import { Division, Station } from "#src/modules/organisation/organisation.model.js";
import { CSRF, createTestApp, createUser, signInAs } from "./helpers/app.js";

/** @type {Awaited<ReturnType<typeof createTestApp>>} */
let t;
/** @type {Record<string, ReturnType<typeof as>>} */
const u = {};
/** @type {Record<string, any>} */
const users = {};
/** @type {Record<string, string>} */
const tokens = {};
/** @type {any} */ let kandy;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
let seq = 0;

/** @param {string} token */
const as = (token) => ({
  get: (/** @type {string} */ p) =>
    t.http().get(`/api/v1${p}`).set("Authorization", `Bearer ${token}`),
  post: (/** @type {string} */ p, /** @type {object} */ b = {}) =>
    t.http().post(`/api/v1${p}`).set(CSRF).set("Authorization", `Bearer ${token}`).send(b),
});

/** Titles of a person's notifications, newest first. @param {string} who */
const titles = async (who) =>
  (await u[who]?.get("/notifications"))?.body.items.map((/** @type {any} */ n) => n.title);

/** HQ accepts a report; the case goes to Kandy by the automatic choice. */
async function dispatchedCase() {
  seq += 1;
  const plate = `CP NT-${String(5000 + seq)}`;
  const occurredAt = new Date(Date.now() - HOUR).toISOString();
  const r = await u.hq?.post("/reports", {
    channel: "whatsapp",
    reporter: { kind: "named", name: "Saman Kumara", phone: "0771234567" },
    occurredAt,
    lat: 7.2936,
    lng: 80.6413,
    address: "Kandy",
    vehicleNumber: plate,
    offenceCodes: ["MTA-FINE"],
    description: "Driver seen committing the offence.",
  });
  const acc = await u.hq?.post(`/reports/${r?.body.id}/accept`, {
    offenceCodes: ["MTA-FINE"],
    vehicleNumber: plate,
    priority: "P2",
    occurredAt,
    lat: 7.2936,
    lng: 80.6413,
  });
  expect(acc?.status).toBe(200);
  return { id: String(acc?.body.case.id), number: String(acc?.body.case.caseNumber) };
}

beforeAll(async () => {
  t = await createTestApp();
  await OffenceVersion.create(
    /** @type {any} */ ({
      code: "MTA-FINE",
      version: 1,
      name: "Offence MTA-FINE",
      legalReference: "s. 1",
      outcome: "spot_fine",
      spotFine: 2000,
      severity: "minor",
      citizenReportable: true,
      publicName: "MTA-FINE",
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
  Object.assign(users, {
    hq: await createUser({ role: "hq_operator" }),
    supervisor: await createUser({ role: "hq_supervisor" }),
    admin: await createUser({ role: "hq_admin" }),
    officer: await createUser({ role: "traffic_officer", stationId: kandy._id }),
    oic: await createUser({ role: "station_oic", stationId: kandy._id }),
    division: await createUser({ role: "division_supervisor", divisionId: div?._id }),
  });
  for (const [k, user] of Object.entries(users)) {
    tokens[k] = await signInAs(t, user);
    u[k] = as(tokens[k]);
  }
});
afterAll(() => t.close());
beforeEach(() => signInLimiter.reset());

describe("notifications for events (§5.2)", () => {
  it("a case sent to a station tells its officers and OIC, not the person who sent it", async () => {
    const c = await dispatchedCase();
    expect(await titles("oic")).toContain(`${c.number} sent to your station`);
    expect(await titles("officer")).toContain(`${c.number} sent to your station`);
    expect(await titles("hq")).not.toContain(`${c.number} sent to your station`);
    const first = (await u.oic?.get("/notifications"))?.body.items[0];
    expect(first).toMatchObject({ link: `/cases/${c.id}`, read: false });
  });

  it("assignment, recommendation and sending back each tell the next person", async () => {
    const c = await dispatchedCase();
    expect((await u.oic?.post(`/cases/${c.id}/accept`))?.status).toBe(200);
    await u.oic?.post(`/cases/${c.id}/officer`, { officerId: String(users.officer._id) });
    expect(await titles("officer")).toContain(`${c.number} assigned to you`);

    const person = await u.officer?.post("/persons", {
      type: "individual",
      name: `Owner ${c.number}`,
      nic: `${String(500000000 + seq)}V`,
      address: "3 Hill Road, Kandy",
    });
    await u.officer?.post(`/cases/${c.id}/trace`, {
      ownerId: person?.body.id,
      ownerFrom: new Date(Date.now() - 400 * DAY).toISOString(),
      dmtReference: `DMT/N${seq}`,
      checkedOn: new Date().toISOString(),
    });
    await t
      .http()
      .put(`/api/v1/cases/${c.id}/review`)
      .set(CSRF)
      .set("Authorization", `Bearer ${tokens.officer}`)
      .send({
        plateReadable: true,
        vehicleMatches: true,
        timePlaceConsistent: true,
        noEditing: true,
        offenceVisible: true,
      });
    const rec = await u.officer?.post(`/cases/${c.id}/recommend`, {
      outcome: "penalty_notice",
      addressee: "owner",
      justification: "Clear evidence of the offence.",
    });
    expect(rec?.status).toBe(200);
    expect(await titles("oic")).toContain(`${c.number} waiting for your decision`);

    await u.oic?.post(`/cases/${c.id}/decide`, {
      action: "send_back",
      reason: "Add the second witness statement first.",
    });
    expect(await titles("officer")).toContain(`Recommendation on ${c.number} sent back`);
  });

  it("marks one read, then all; nobody can mark another person's", async () => {
    const list = (await u.officer?.get("/notifications?unread=true"))?.body;
    expect(list.unread).toBeGreaterThan(1);
    const mine = list.items[0].id;
    expect((await u.oic?.post(`/notifications/${mine}/read`))?.status).toBe(404);
    const one = await u.officer?.post(`/notifications/${mine}/read`);
    expect(one?.body.unread).toBe(list.unread - 1);
    expect((await u.officer?.post("/notifications/read-all"))?.body.unread).toBe(0);
    expect((await u.officer?.get("/notifications/unread"))?.body.unread).toBe(0);
  });
});

describe("grouping (N2, D09-7)", () => {
  it("more than 10 similar alerts in an hour become one summary", async () => {
    const someone = await createUser({ role: "hq_operator" });
    for (let i = 1; i <= 13; i += 1) {
      await inTransaction((session) =>
        notify(session, [{ user: someone._id }], {
          kind: "test.flood",
          title: `Alert ${i}`,
          group: "Test alerts",
        }),
      );
    }
    const rows = await Notification.find({ userId: someone._id }).lean();
    expect(rows.filter((n) => !n.grouped)).toHaveLength(10);
    expect(rows.filter((n) => n.grouped)).toEqual([
      expect.objectContaining({ title: "Test alerts", count: 3 }),
    ]);
  });
});

describe("missed time limits (T3, T4)", () => {
  it("alerts once at the limit, escalates once at twice the limit, and resolves", async () => {
    const c = await dispatchedCase();
    const breachOf = () => Breach.findOne({ limitKey: "cases.accept", "item.id": c.id }).lean();

    // Not accepted within 24 h: the station and HQ operators are told.
    let r = await runDeadlineSweep(new Date(Date.now() + 25 * HOUR));
    expect(r.breached).toBeGreaterThanOrEqual(1);
    const title = `${c.number}: not accepted by the station`;
    expect(await titles("oic")).toContain(title);
    expect(await titles("hq")).toContain(title);
    expect(await titles("supervisor")).not.toContain(title);

    // Once per breach.
    await runDeadlineSweep(new Date(Date.now() + 26 * HOUR));
    expect((await titles("oic")).filter((/** @type {string} */ x) => x === title)).toHaveLength(1);

    // Twice the limit: HQ supervisors and the division supervisor.
    r = await runDeadlineSweep(new Date(Date.now() + 49 * HOUR));
    expect(r.escalated).toBeGreaterThanOrEqual(1);
    const escalated = `${title} — twice the time limit`;
    expect(await titles("supervisor")).toContain(escalated);
    expect(await titles("division")).toContain(escalated);
    expect((await breachOf())?.escalatedAt).toBeTruthy();

    // Shown in the area's overdue list until resolved.
    const overdue = (await u.oic?.get("/overdue"))?.body;
    expect(overdue.items.map((/** @type {any} */ b) => b.item.number)).toContain(c.number);
    expect(overdue.kinds).toEqual(
      expect.arrayContaining([expect.objectContaining({ limitKey: "cases.accept" })]),
    );
    const elsewhere = await createUser({ role: "station_oic" });
    const other = as(await signInAs(t, elsewhere));
    expect((await other.get("/overdue"))?.body.total).toBe(0);

    await u.oic?.post(`/cases/${c.id}/accept`);
    r = await runDeadlineSweep(new Date(Date.now() + 50 * HOUR));
    expect((await breachOf())?.resolvedAt).toBeTruthy();
    expect(
      (await u.oic?.get("/overdue"))?.body.items.map((/** @type {any} */ b) => b.item.number),
    ).not.toContain(c.number);
  });
});

describe("hearings and stations (§4)", () => {
  it("reminds the prosecuting officer once before a hearing", async () => {
    const hearing = new Date(Date.now() + 2 * DAY);
    await CourtCase.create(
      /** @type {any} */ ({
        courtRef: "CR-2026-900001",
        status: "filed",
        route: "court_offence",
        caseId: new mongoose.Types.ObjectId(),
        caseNumber: "TC-2026-900001",
        stationId: kandy._id,
        prosecutingOfficer: { id: users.officer._id, name: users.officer.name },
        hearings: [{ date: hearing }],
      }),
    );
    await runDeadlineSweep();
    await runDeadlineSweep();
    const reminders = await Notification.find({
      userId: users.officer._id,
      kind: "court.hearing_soon",
    }).lean();
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.title).toMatch(/^CR-2026-900001: hearing on /);
  });

  it("tells HQ administrators about a verified station with no OIC, once a day", async () => {
    await Station.create(
      /** @type {any} */ ({ name: "Galaha Police Station", code: "GLH", verified: true }),
    );
    await runDeadlineSweep();
    await runDeadlineSweep();
    const rows = await Notification.find({
      userId: users.admin._id,
      kind: "station.no_oic",
    }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toContain("Galaha Police Station");
  });
});

describe("SMS to addressees (§5.4)", () => {
  it("sends queued SMS through the gateway; a number it refuses is marked failed", async () => {
    const base = {
      noticeId: new mongoose.Types.ObjectId(),
      noticeNumber: "PN-2026-900001",
      channel: /** @type {const} */ ("sms"),
      kind: "notice",
      text: "Sri Lanka Police: test.",
    };
    const [good, bad, cancelled] = await OutboxMessage.create([
      { ...base, to: "077 123 4567" },
      { ...base, to: "011 234 5678" },
      { ...base, to: "0771234567", status: "cancelled" },
    ]);
    expect(await runSmsDispatch()).toEqual({ sent: 1, failed: 1 });
    expect(await OutboxMessage.findById(good?._id).lean()).toMatchObject({
      status: "sent",
      reference: expect.stringMatching(/^SMS-/),
    });
    expect(await OutboxMessage.findById(bad?._id).lean()).toMatchObject({
      status: "failed",
      error: "not_a_mobile_number",
    });
    expect((await OutboxMessage.findById(cancelled?._id).lean())?.status).toBe("cancelled");
  });
});

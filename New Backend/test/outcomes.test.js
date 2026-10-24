// Outcomes — docs/05 §3, §4; docs/03 §7, §8: recommend when ready, decide
// by someone else (S1, S2), send back, change, no further action, HQ
// override, reopen and merge; the repeat-offender banner.

import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifyAuditChain } from "#src/core/audit/audit.js";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { OffenceVersion } from "#src/modules/offences/offences.model.js";
import { Division, Station } from "#src/modules/organisation/organisation.model.js";
import { Report } from "#src/modules/reports/report.model.js";
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

/** @param {string} code @param {"minor" | "severe"} severity @param {"spot_fine" | "court"} outcome */
const offence = (code, severity, outcome = "spot_fine") => ({
  code,
  version: 1,
  name: code,
  legalReference: code,
  outcome,
  spotFine: outcome === "spot_fine" ? 1000 : null,
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

const KANDY = { lat: 7.2936, lng: 80.6413 };
const GALLE = { lat: 6.0329, lng: 80.2168 };

/**
 * A case dispatched by HQ, accepted by `investigator`, owner traced (with an
 * address) and evidence reviewed — ready to recommend.
 * @param {{ investigator: string, place?: { lat: number, lng: number }, plate?: string, offences?: string[], review?: boolean }} o
 */
async function readyCase(o) {
  seq += 1;
  const plate = o.plate ?? `WP KA-${String(1000 + seq)}`;
  const offences = o.offences ?? ["MTA-157A"];
  const place = o.place ?? KANDY;
  const occurredAt = new Date(Date.now() - 3_600_000).toISOString();
  const r = await u.hq?.post("/reports", {
    channel: "whatsapp",
    reporter: { kind: "named", name: "Saman Kumara", phone: "0771234567" },
    occurredAt,
    ...place,
    address: "Somewhere",
    vehicleNumber: plate,
    offenceCodes: offences,
    description: "Driver seen committing the offence.",
  });
  const acc = await u.hq?.post(`/reports/${r?.body.id}/accept`, {
    offenceCodes: offences,
    vehicleNumber: plate,
    priority: "P2",
    occurredAt,
    ...place,
  });
  const caseId = acc?.body.case.id;
  const inv = /** @type {ReturnType<typeof as>} */ (u[o.investigator]);
  expect((await inv.post(`/cases/${caseId}/accept`)).status).toBe(200);
  const person = await inv.post("/persons", {
    type: "individual",
    name: `Owner ${seq}`,
    nic: `${String(700000000 + seq)}V`,
    address: "12 Hill Street, Kandy",
  });
  expect(
    (
      await inv.post(`/cases/${caseId}/trace`, {
        ownerId: person.body.id,
        ownerFrom: new Date(Date.now() - 400 * DAY).toISOString(),
        dmtReference: `DMT/${seq}`,
        checkedOn: new Date().toISOString(),
      })
    ).status,
  ).toBe(200);
  if (o.review !== false) {
    await inv.put(`/cases/${caseId}/review`, {
      plateReadable: true,
      vehicleMatches: true,
      timePlaceConsistent: true,
      noEditing: true,
      offenceVisible: true,
    });
  }
  return { caseId: /** @type {string} */ (caseId), reportId: r?.body.id, plate };
}

/** @param {string} who @param {string} caseId @param {object} [extra] */
const recommendNotice = (who, caseId, extra = {}) =>
  u[who]?.post(`/cases/${caseId}/recommend`, {
    outcome: "penalty_notice",
    addressee: "owner",
    justification: "Clear photo of the driver without a seat belt.",
    ...extra,
  });

beforeAll(async () => {
  t = await createTestApp();
  await OffenceVersion.create([
    offence("MTA-157A", "minor"),
    offence("MTA-217", "severe"),
    offence("MTA-COURT", "severe", "court"),
  ]);
  const [div] = await Division.create([{ name: "Kandy", code: "KANDY" }]);
  const [kandy, galle] = await Station.create(
    /** @type {any[]} */ ([
      {
        name: "Kandy Police Station",
        code: "KDY",
        divisionId: div?._id,
        verified: true,
        location: { type: "Point", coordinates: [80.6337, 7.2906] },
      },
      {
        // No division: S2 decisions go to an HQ supervisor.
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
    division: await createUser({ role: "division_supervisor", divisionId: div?._id }),
    galleOic: await createUser({ role: "station_oic", stationId: galle?._id }),
  };
  for (const [k, user] of Object.entries(accounts)) u[k] = as(await signInAs(t, user));
});
afterAll(() => t.close());
beforeEach(() => signInLimiter.reset());

describe("recommend", () => {
  it("lists what is missing, and refuses until ready", async () => {
    const { caseId } = await readyCase({ investigator: "officer", review: false });
    const view = await u.officer?.get(`/cases/${caseId}`);
    expect(view?.body.readiness.penalty_notice).toContain("Complete the evidence review.");
    expect(view?.body.readiness.no_further_action).toEqual([]);
    const res = await recommendNotice("officer", caseId);
    expect(res?.status).toBe(409);
    expect(res?.body.error.code).toBe("not_ready");
  });

  it("refuses a notice for a court-only offence, and a warning for a severe one", async () => {
    const court = await readyCase({ investigator: "officer", offences: ["MTA-COURT"] });
    const notice = await recommendNotice("officer", court.caseId, { offenceCodes: ["MTA-COURT"] });
    expect(notice?.body.error.message).toMatch(/MTA-COURT can only go to court/);
    const severe = await readyCase({ investigator: "officer", offences: ["MTA-217"] });
    const warning = await u.officer?.post(`/cases/${severe.caseId}/recommend`, {
      outcome: "warning",
      addressee: "owner",
      offenceCodes: ["MTA-217"],
      justification: "First time, minor in effect.",
    });
    expect(warning?.body.error.message).toMatch(/minor offences only/);
    // A court referral needs a summary for the prosecution.
    const toCourt = await u.officer?.post(`/cases/${court.caseId}/recommend`, {
      outcome: "court",
      addressee: "owner",
      offenceCodes: ["MTA-COURT"],
      justification: "Court-only offence.",
    });
    expect(toCourt?.body.error.message).toMatch(/summary for the prosecution/);
  });
});

describe("decide", () => {
  it("the OIC decides an officer's recommendation (S1); the facts are then locked", async () => {
    const { caseId } = await readyCase({ investigator: "officer" });
    const rec = await recommendNotice("officer", caseId, { offenceCodes: ["MTA-157A"] });
    expect(rec?.body).toMatchObject({
      status: "recommended",
      recommendation: { outcome: "penalty_notice", addressee: "owner" },
      deadline: { kind: "decide" },
    });
    // 3 days to decide.
    const days = (Date.parse(rec?.body.deadline.at) - Date.now()) / DAY;
    expect(days).toBeGreaterThan(2.99);
    expect((await u.officer?.post(`/cases/${caseId}/decide`, { action: "approve" }))?.status).toBe(
      403,
    );
    const queue = await u.oic?.get("/cases?view=to_decide");
    expect(queue?.body.items.map((/** @type {any} */ c) => c.id)).toContain(caseId);

    const res = await u.oic?.post(`/cases/${caseId}/decide`, { action: "approve" });
    expect(res?.body).toMatchObject({
      status: "decided",
      decision: { outcome: "penalty_notice", kind: "approved", level: "oic" },
    });
    const late = await u.officer?.put(`/cases/${caseId}/review`, {
      plateReadable: true,
      vehicleMatches: true,
      timePlaceConsistent: true,
      noEditing: true,
      offenceVisible: true,
    });
    expect(late?.status).toBe(409);
  });

  it("when the OIC investigated, the division supervisor decides (S2); with no division, HQ", async () => {
    const { caseId } = await readyCase({ investigator: "oic" });
    await recommendNotice("oic", caseId);
    const own = await u.oic?.post(`/cases/${caseId}/decide`, { action: "approve" });
    expect(own?.status).toBe(403);
    expect(own?.body.error.message).toMatch(/someone else decides/);
    expect(
      (await u.supervisor?.post(`/cases/${caseId}/decide`, { action: "approve" }))?.status,
    ).toBe(403);
    const byDivision = await u.division?.post(`/cases/${caseId}/decide`, { action: "approve" });
    expect(byDivision?.body.decision).toMatchObject({ level: "division" });

    const galle = await readyCase({ investigator: "galleOic", place: GALLE });
    await recommendNotice("galleOic", galle.caseId);
    expect(
      (await u.division?.post(`/cases/${galle.caseId}/decide`, { action: "approve" }))?.status,
    ).toBe(404);
    const queue = await u.supervisor?.get("/cases?view=to_decide");
    expect(queue?.body.items.map((/** @type {any} */ c) => c.id)).toContain(galle.caseId);
    const byHq = await u.supervisor?.post(`/cases/${galle.caseId}/decide`, { action: "approve" });
    expect(byHq?.body.decision).toMatchObject({ level: "hq" });
  });

  it("send back for more work, then change the outcome with a reason", async () => {
    const { caseId } = await readyCase({ investigator: "officer" });
    await recommendNotice("officer", caseId);
    const back = await u.oic?.post(`/cases/${caseId}/decide`, {
      action: "send_back",
      reason: "Get the owner's statement first.",
    });
    expect(back?.body).toMatchObject({
      status: "investigating",
      recommendation: { sentBack: { reason: "Get the owner's statement first." } },
    });
    await recommendNotice("officer", caseId);
    const changed = await u.oic?.post(`/cases/${caseId}/decide`, {
      action: "change",
      outcome: "warning",
      addressee: "owner",
      offenceCodes: ["MTA-157A"],
      reason: "First offence for this owner; a warning is enough.",
    });
    expect(changed?.body.decision).toMatchObject({ outcome: "warning", kind: "changed" });
  });
});

describe("closing, HQ and history", () => {
  it("no further action closes the case and tells the app; HQ reopens and overrides", async () => {
    const { caseId } = await readyCase({ investigator: "officer" });
    await u.officer?.post(`/cases/${caseId}/recommend`, {
      outcome: "no_further_action",
      nfaReason: "insufficient_evidence",
      justification: "The plate isn't readable in the only photo.",
    });
    const closed = await u.oic?.post(`/cases/${caseId}/decide`, { action: "approve" });
    expect(closed?.body).toMatchObject({
      status: "closed",
      decision: { outcome: "no_further_action" },
    });

    expect(
      (await u.hq?.post(`/cases/${caseId}/reopen`, { reason: "New footage arrived." }))?.status,
    ).toBe(403);
    const reopened = await u.supervisor?.post(`/cases/${caseId}/reopen`, {
      reason: "New footage arrived from a shop camera.",
    });
    expect(reopened?.body.status).toBe("investigating");

    const other = await readyCase({ investigator: "officer" });
    await recommendNotice("officer", other.caseId);
    await u.oic?.post(`/cases/${other.caseId}/decide`, { action: "approve" });
    const overridden = await u.supervisor?.post(`/cases/${other.caseId}/override`, {
      reason: "The owner sold the car before the offence.",
    });
    expect(overridden?.body).toMatchObject({
      status: "recommended",
      decision: null,
      overriddenDecisions: [
        { outcome: "penalty_notice", reason: "The owner sold the car before the offence." },
      ],
    });
  });

  it("HQ merges two undecided cases; the reports move", async () => {
    const a = await readyCase({ investigator: "officer" });
    const b = await readyCase({ investigator: "officer" });
    const into = (await u.hq?.get(`/cases/${b.caseId}`))?.body.caseNumber;
    const res = await u.hq?.post(`/cases/${a.caseId}/merge`, {
      intoCaseNumber: into,
      reason: "Same incident triaged twice.",
    });
    expect(res?.body.id).toBe(b.caseId);
    expect(res?.body.reports).toHaveLength(2);
    const from = (await u.hq?.get(`/cases/${a.caseId}`))?.body;
    expect(from).toMatchObject({ status: "closed", mergedInto: { caseNumber: into } });
    expect(String((await Report.findById(a.reportId).lean())?.caseId)).toBe(b.caseId);
    expect(
      (
        await u.hq?.post(`/cases/${b.caseId}/merge`, {
          intoCaseNumber: from.caseNumber,
          reason: "Undo, by mistake.",
        })
      )?.status,
    ).toBe(409);
  });

  it("no warning after an enforcement outcome; a repeat offender shows the banner", async () => {
    const plate = "WP RPT-0001";
    for (let i = 0; i < 3; i += 1) {
      const { caseId } = await readyCase({ investigator: "officer", plate });
      await recommendNotice("officer", caseId);
      await u.oic?.post(`/cases/${caseId}/decide`, { action: "approve" });
    }
    const { caseId } = await readyCase({ investigator: "officer", plate });
    const view = (await u.officer?.get(`/cases/${caseId}`))?.body;
    expect(view.repeatOffender.vehicle).toBeGreaterThanOrEqual(3);
    expect(view.readiness.warning).toContain(
      "An enforcement outcome in the last 12 months rules out a warning.",
    );
  });

  it("keeps the audit chain intact", async () => {
    expect(await verifyAuditChain()).toBeNull();
    expect(mongoose.connection.readyState).toBe(1);
  });
});

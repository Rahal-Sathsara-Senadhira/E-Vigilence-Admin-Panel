// The offence schedule — docs/14 §4.5 (versions), docs/11 §3 (public copy).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { OffenceVersion, PublicOffence } from "#src/modules/offences/offences.model.js";
import { publishPublicSchedule } from "#src/modules/offences/offences.service.js";
import { CSRF, createTestApp, createUser, signInAs } from "./helpers/app.js";

/** @type {Awaited<ReturnType<typeof createTestApp>>} */
let t;
/** @type {ReturnType<typeof as>} */ let hq;

/** @param {string} token */
const as = (token) => ({
  get: (/** @type {string} */ p) =>
    t.http().get(`/api/v1${p}`).set("Authorization", `Bearer ${token}`),
  post: (/** @type {string} */ p, /** @type {object} */ b = {}) =>
    t.http().post(`/api/v1${p}`).set(CSRF).set("Authorization", `Bearer ${token}`).send(b),
});

const seatBelt = {
  code: "MTA-157A",
  name: "Seat belt not worn",
  legalReference: "MTA s. 157A",
  outcome: /** @type {"spot_fine" | "court"} */ ("spot_fine"),
  spotFine: 1000,
  severity: /** @type {"minor" | "moderate" | "severe"} */ ("minor"),
  vehicleTypes: [],
  citizenReportable: true,
  publicName: "No seat belt",
  publicDescription: "The driver or a front passenger is not wearing a seat belt.",
};

beforeAll(async () => {
  t = await createTestApp();
  await OffenceVersion.create({
    ...seatBelt,
    version: 1,
    active: true,
    effectiveFrom: new Date(),
    current: true,
    source: "Gazette 2054/9",
    changedBy: "Initial import",
    reason: "Initial schedule",
  });
  await publishPublicSchedule();
  hq = as(await signInAs(t, await createUser({ role: "hq_admin" })));
});
afterAll(() => t.close());
beforeEach(() => signInLimiter.reset());

describe("offence schedule", () => {
  it("every role that handles reports can read it", async () => {
    const officer = as(await signInAs(t, await createUser({ role: "traffic_officer" })));
    const res = await officer.get("/offences");
    expect(res.body[0]).toMatchObject({ code: "MTA-157A", spotFine: 1000, version: 1 });
    expect((await officer.post("/offences", { ...seatBelt, code: "X-1" })).status).toBe(403);
  });

  it("a change creates a new version; the old one is kept and closed", async () => {
    const res = await hq.post("/offences/mta-157a/versions", {
      ...seatBelt,
      spotFine: 2000,
      active: true,
      reason: "Gazette 2400/1 raised the fine",
    });
    expect(res.body).toMatchObject({
      version: 2,
      spotFine: 2000,
      reason: "Gazette 2400/1 raised the fine",
    });
    expect(res.body.history).toHaveLength(2);
    expect(res.body.history[1]).toMatchObject({
      version: 1,
      spotFine: 1000,
      effectiveTo: expect.any(String),
    });
    const again = await hq.post("/offences/MTA-157A/versions", {
      ...seatBelt,
      spotFine: 2000,
      active: true,
      reason: "No real change here",
    });
    expect(again.body.error.code).toBe("no_change");
  });

  it("a spot fine needs an amount; a court-only offence has none", async () => {
    const noFine = await hq.post("/offences", { ...seatBelt, code: "MTA-999", spotFine: null });
    expect(noFine.body.error.fields.spotFine).toBeTruthy();
    const court = await hq.post("/offences", {
      ...seatBelt,
      code: "MTA-216",
      outcome: "court",
      spotFine: null,
      severity: "severe",
      name: "Drunk driving",
      publicName: "Drunk driving",
    });
    expect(court.status).toBe(201);
    expect(court.body).toMatchObject({ outcome: "court", spotFine: null });
  });

  it("the mobile app's copy has public names only, and drops deactivated offences", async () => {
    const pub = await PublicOffence.find().lean();
    expect(pub.map((p) => p.code).sort()).toEqual(["MTA-157A", "MTA-216"]);
    expect(Object.keys(pub[0] ?? {})).not.toContain("spotFine");
    await hq.post("/offences/MTA-216/versions", {
      ...seatBelt,
      code: undefined,
      outcome: "court",
      spotFine: null,
      severity: "severe",
      name: "Drunk driving",
      publicName: "Drunk driving",
      active: false,
      reason: "Moved to another schedule",
    });
    expect((await PublicOffence.find().lean()).map((p) => p.code)).toEqual(["MTA-157A"]);
  });
});

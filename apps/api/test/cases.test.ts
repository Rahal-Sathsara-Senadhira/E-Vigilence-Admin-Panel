// Cases — docs/03 (dispatch, acceptance, returns, investigating officer,
// merge, reopen), docs/04 §6 (investigation, registers), docs/05 §3–4
// (recommendation, decision, separation of duties).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publishPublicSchedule, seedOffenceSchedule } from "../src/modules/offences/schedule.data";
import { bearer, createStaff, createTestApp, signIn, type TestApp } from "./helpers";

let t: TestApp;
let fort: string; // has a drawn jurisdiction around Colombo Fort
let pettah: string; // next door, no jurisdiction
let kandy: string; // far away
let hq: string;
let hq2: string;
let fortOfficer1: string;
let fortOfficer1Id: string;
let fortOfficer2: string;
let fortOfficer2Id: string;
let fortOic: string;
let pettahOfficer: string;
let kandyOfficer: string;

const INSIDE_FORT = { lat: 6.935, lng: 79.85 };
const NEAR_PETTAH = { lat: 6.9395, lng: 79.8535 + 0.02 }; // outside the drawn area, nearest to Pettah

async function station(name: string, lng: number, lat: number) {
  const [s] = await t.stations.create([
    { name, isActive: true, verified: true, location: { type: "Point", coordinates: [lng, lat] } },
  ]);
  return String(s!._id);
}

/** A WhatsApp report accepted at triage — which dispatches the new case automatically. */
async function newCase(point = INSIDE_FORT, overrides: Record<string, unknown> = {}) {
  const report = await t
    .http()
    .post("/api/v1/reports")
    .set(bearer(hq))
    .send({
      channel: "whatsapp",
      reporter: { kind: "named", name: "Saman Kumara", phone: "0771234567" },
      occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
      location: point,
      address: "Chatham Street, Colombo 01",
      vehicleNumber: `WP CAB-${1000 + Math.floor(Math.random() * 8999)}`,
      vehicleType: "car",
      offenceCodes: ["MTA-157A"],
      description: "Driver without a seat belt on Chatham Street.",
      ...overrides,
    });
  const accepted = await t
    .http()
    .post(`/api/v1/reports/${report.body.id}/accept`)
    .set(bearer(hq))
    .send({
      offenceCodes: overrides.offenceCodes ?? ["MTA-157A"],
      vehicleNumber: report.body.vehicleNumber,
      vehicleType: "car",
      location: point,
      address: "Chatham Street, Colombo 01",
      occurredAt: report.body.occurredAt,
      priority: "P2",
      noEvidenceReason: "Seen by two traffic officers on duty",
    });
  if (accepted.status !== 200) throw new Error(`accept failed: ${JSON.stringify(accepted.body)}`);
  return accepted.body.caseId as string;
}

const getCase = (id: string, token = hq) => t.http().get(`/api/v1/cases/${id}`).set(bearer(token));
const post = (id: string, path: string, token: string, body: object = {}) =>
  t.http().post(`/api/v1/cases/${id}/${path}`).set(bearer(token)).send(body);

async function person(token: string, body: Record<string, unknown>) {
  const res = await t.http().post("/api/v1/persons").set(bearer(token)).send(body);
  if (res.status !== 201) throw new Error(`person: ${JSON.stringify(res.body)}`);
  return res.body.id as string;
}

/** Accept, trace, review — a case ready to recommend. */
async function readyCase(acceptToken = fortOfficer1, opts: { address?: boolean } = {}) {
  const id = await newCase();
  await post(id, "accept", acceptToken);
  const owner = await person(acceptToken, {
    type: "individual",
    name: "Kasun Perera",
    nic: `19${Math.floor(1e9 + Math.random() * 8e9)}`,
    address: opts.address === false ? undefined : "12 Main Street, Colombo 11",
  });
  const c = (await getCase(id)).body;
  await post(id, "vehicle-trace", acceptToken, {
    plate: c.vehicleNumber,
    type: "car",
    colour: "White",
    ownerId: owner,
    dmtReference: "DMT/2026/55120",
  });
  await t.http().put(`/api/v1/cases/${id}/evidence-review`).set(bearer(acceptToken)).send({
    plateReadable: true,
    vehicleMatches: true,
    timePlaceConsistent: true,
    notEdited: true,
    offenceVisible: true,
  });
  return { id, owner };
}

beforeAll(async () => {
  t = await createTestApp();
  await seedOffenceSchedule(t.conn, true);
  await publishPublicSchedule(t.conn);
  fort = await station("Fort", 79.8465, 6.9344);
  pettah = await station("Pettah", 79.8535, 6.9395);
  kandy = await station("Kandy", 80.6337, 7.2906);
  await t.stations.updateOne(
    { _id: fort },
    {
      $set: {
        jurisdiction: {
          type: "Polygon",
          coordinates: [
            [
              [79.84, 6.925],
              [79.86, 6.925],
              [79.86, 6.945],
              [79.84, 6.945],
              [79.84, 6.925],
            ],
          ],
        },
        jurisdictionAreaKm2: 4.9,
      },
    },
  );

  hq = (await signIn(t, await createStaff(t, { role: "hq" }))).token;
  hq2 = (await signIn(t, await createStaff(t, { role: "hq" }))).token;
  const o1 = await createStaff(t, { role: "station_officer", stationId: fort });
  const o2 = await createStaff(t, { role: "station_officer", stationId: fort });
  const oic = await createStaff(t, { role: "station_oic", stationId: fort });
  fortOfficer1 = (await signIn(t, o1)).token;
  fortOfficer1Id = o1.id;
  fortOfficer2 = (await signIn(t, o2)).token;
  fortOfficer2Id = o2.id;
  fortOic = (await signIn(t, oic)).token;
  pettahOfficer = (
    await signIn(t, await createStaff(t, { role: "station_officer", stationId: pettah }))
  ).token;
  kandyOfficer = (
    await signIn(t, await createStaff(t, { role: "station_officer", stationId: kandy }))
  ).token;
});
afterAll(() => t.close());

describe("dispatch (03 §5.1)", () => {
  it("sends a case inside a drawn area to that station, with a 24-hour acceptance limit", async () => {
    const id = await newCase(INSIDE_FORT);
    const c = (await getCase(id)).body;
    expect(c).toMatchObject({ status: "dispatched", stationName: "Fort" });
    expect(c.dispatches[0]).toMatchObject({ method: "jurisdiction", flags: [] });
    const hours =
      (new Date(c.dueAt).getTime() - new Date(c.dispatches[0].at).getTime()) / 3_600_000;
    expect(hours).toBeCloseTo(24, 1);
  });

  it("otherwise sends it to the nearest active station", async () => {
    const id = await newCase(NEAR_PETTAH);
    const c = (await getCase(id)).body;
    expect(c.dispatches[0]).toMatchObject({ method: "nearest", stationName: "Pettah" });
    expect(c.dispatches[0].distanceKm).toBeGreaterThan(0);
  });

  it("flags a station with no active officers", async () => {
    const empty = await station("Empty Post", 81.2, 8.5);
    const res = await post(await newCase(INSIDE_FORT), "dispatch", hq, {
      stationId: empty,
      reason: "Testing the warning",
    });
    expect(res.body.summary).toContain("no_active_officers");
  });
});

describe("accept and return (03 §5.3, §6)", () => {
  it("only the dispatched station can accept; the accepting officer becomes the investigating officer", async () => {
    const id = await newCase();
    expect((await post(id, "accept", kandyOfficer)).status).toBe(404);
    expect((await post(id, "accept", fortOfficer1)).status).toBe(200);
    const c = (await getCase(id, fortOfficer1)).body;
    expect(c).toMatchObject({ status: "accepted", investigatingOfficerId: fortOfficer1Id });
    expect(c.can).toMatchObject({ work: true, return: true, accept: false });
  });

  it("re-dispatches past a station that returned it, and after two returns needs HQ's choice", async () => {
    const id = await newCase(INSIDE_FORT);
    expect((await post(id, "return", fortOfficer1, { reason: "Short" })).status).toBe(400);
    expect(
      (await post(id, "return", fortOfficer1, { reason: "This junction belongs to Pettah police" }))
        .status,
    ).toBe(200);

    const again = await post(id, "dispatch", hq);
    expect(again.status).toBe(200);
    let c = (await getCase(id)).body;
    expect(c.stationName).not.toBe("Fort"); // Fort returned it, so it's skipped

    const second = c.stationName === "Pettah" ? pettahOfficer : kandyOfficer;
    await post(id, "return", second, { reason: "Not our area either, it is inside the Fort" });
    c = (await getCase(id)).body;
    expect(c.flags).toContain("disputed_jurisdiction");
    expect(c.returnCount).toBe(2);

    const auto = await post(id, "dispatch", hq);
    expect(auto.body.error.code).toBe("disputed_jurisdiction");
    expect(
      (await post(id, "dispatch", hq, { stationId: fort, reason: "HQ ruling: Fort's area" }))
        .status,
    ).toBe(200);
    const blocked = await post(id, "return", fortOfficer1, {
      reason: "We still think it is Pettah's",
    });
    expect(blocked.body.error.code).toBe("return_not_allowed");
  });

  it("can't be returned once work is recorded", async () => {
    const id = await newCase();
    await post(id, "accept", fortOfficer1);
    await post(id, "notes", fortOfficer1, { text: "Checked the CCTV request." });
    const res = await post(id, "return", fortOfficer1, {
      reason: "Changed our mind about the area",
    });
    expect(res.body.error.code).toBe("work_started");
  });

  it("the OIC reassigns the investigating officer, only to an officer at the station", async () => {
    const id = await newCase();
    await post(id, "accept", fortOfficer1);
    expect((await post(id, "officer", fortOfficer2, { officerId: fortOfficer2Id })).status).toBe(
      403,
    );
    expect((await post(id, "officer", fortOic, { officerId: kandy })).status).toBe(400);
    expect(
      (
        await post(id, "officer", fortOic, {
          officerId: fortOfficer2Id,
          note: "Officer 1 on leave",
        })
      ).status,
    ).toBe(200);
    expect((await getCase(id)).body.investigatingOfficerId).toBe(fortOfficer2Id);
  });
});

describe("investigation (04 §6, D03-8)", () => {
  it("only the investigating officer or the OIC records work; the first work starts the investigation (C2)", async () => {
    const id = await newCase();
    await post(id, "accept", fortOfficer1);
    expect((await post(id, "notes", fortOfficer2, { text: "Not my case" })).status).toBe(403);
    expect(
      (await post(id, "notes", fortOfficer1, { text: "Requested footage from the bank camera." }))
        .status,
    ).toBe(200);
    expect((await post(id, "notes", fortOic, { text: "Priority this week." })).status).toBe(200);
    const c = (await getCase(id)).body;
    expect(c.status).toBe("investigating");
    expect(c.notes).toHaveLength(2);
    expect((await getCase(id, kandyOfficer)).status).toBe(404);
  });

  it("builds the registers: no duplicate NIC, ownership kept as history, person views logged", async () => {
    const nic = "198011223344";
    const first = await person(fortOfficer1, {
      type: "individual",
      name: "Nimal Silva",
      nic,
      address: "5 Lake Road, Colombo 2",
    });
    const dup = await t
      .http()
      .post("/api/v1/persons")
      .set(bearer(fortOfficer1))
      .send({ type: "individual", name: "N. Silva", nic });
    expect(dup.body.error.code).toBe("person_exists");
    const found = await t.http().get(`/api/v1/persons/search?nic=${nic}`).set(bearer(fortOfficer1));
    expect(found.body[0]).toMatchObject({ id: first, nicMasked: "********3344" });

    const id = await newCase();
    await post(id, "accept", fortOfficer1);
    const plate = (await getCase(id)).body.vehicleNumber;
    await post(id, "vehicle-trace", fortOfficer1, {
      plate,
      type: "car",
      ownerId: first,
      dmtReference: "DMT/1",
    });
    const buyer = await person(fortOfficer1, {
      type: "individual",
      name: "Dilan Fernando",
      address: "9 Sea Street",
    });
    await post(id, "vehicle-trace", fortOfficer1, {
      plate,
      type: "car",
      ownerId: buyer,
      dmtReference: "DMT/2",
      ownedFrom: new Date().toISOString(),
    });

    const c = (await getCase(id)).body;
    const vehicle = (await t.http().get(`/api/v1/vehicles/${c.vehicle.id}`).set(bearer(hq))).body;
    expect(vehicle.ownership.map((o: { personName: string }) => o.personName)).toEqual([
      "Nimal Silva",
      "Dilan Fernando",
    ]);
    expect(vehicle.ownership[0].to).not.toBeNull();
    expect(vehicle.currentOwner.name).toBe("Dilan Fernando");

    expect((await t.http().get(`/api/v1/persons/${buyer}`).set(bearer(fortOfficer1))).status).toBe(
      200,
    );
    expect(
      await t.conn.collection("audit_log").findOne({ action: "person.viewed", "target.id": buyer }),
    ).not.toBeNull();
    expect((await t.http().get(`/api/v1/persons/${buyer}`).set(bearer(kandyOfficer))).status).toBe(
      403,
    );
  });
});

describe("recommendation (05 §3)", () => {
  it("is refused until the case is ready", async () => {
    const id = await newCase();
    await post(id, "accept", fortOfficer1);
    await post(id, "notes", fortOfficer1, { text: "Started." });
    const res = await post(id, "recommend", fortOfficer1, {
      outcome: "nfa",
      nfaReason: "insufficient_evidence",
      justification: "Footage too blurry to read the plate.",
    });
    expect(res.body.error.code).toBe("not_ready");
    expect(res.body.error.message).toContain("evidence review");
  });

  it("needs the addressee's address for a penalty notice, and no court-only offence", async () => {
    const { id } = await readyCase(fortOfficer1, { address: false });
    const noAddress = await post(id, "recommend", fortOfficer1, {
      outcome: "penalty_notice",
      addressee: "owner",
      justification: "Clear photo of the driver without a belt.",
    });
    expect(noAddress.body.error.code).toBe("address_missing");

    const court = await readyCase();
    await t
      .http()
      .patch(`/api/v1/cases/${court.id}/facts`)
      .set(bearer(fortOfficer1))
      .send({
        offenceCodes: ["MTA-217"],
        note: "Footage shows reckless driving, not just the belt",
      });
    const notice = await post(court.id, "recommend", fortOfficer1, {
      outcome: "penalty_notice",
      addressee: "owner",
      justification: "Owner identified and evidence clear.",
    });
    expect(notice.body.error.code).toBe("court_only_offence");
    const warning = await post(court.id, "recommend", fortOfficer1, {
      outcome: "warning",
      addressee: "owner",
      justification: "First time; a warning is enough.",
    });
    expect(warning.body.error.code).toBe("warning_not_allowed");
  });
});

describe("decision and separation of duties (01 §5, 05 §4)", () => {
  it("the recommender can't decide (S1); the OIC approves", async () => {
    const { id } = await readyCase(fortOfficer1);
    expect(
      (
        await post(id, "recommend", fortOfficer1, {
          outcome: "penalty_notice",
          addressee: "owner",
          justification: "Clear photo, owner traced.",
        })
      ).status,
    ).toBe(200);
    const c = (await getCase(id)).body;
    expect(c.status).toBe("recommended");
    expect((await post(id, "decide", fortOfficer1, { action: "approve" })).status).toBe(403);
    const ok = await post(id, "decide", fortOic, { action: "approve" });
    expect(ok.status).toBe(200);
    const decided = (await getCase(id)).body;
    expect(decided).toMatchObject({
      status: "decided",
      decision: {
        outcome: "penalty_notice",
        addressee: "owner",
        changed: false,
        role: "station_oic",
      },
    });
    // Facts are locked once decided.
    expect((await post(id, "notes", fortOic, { text: "One more note" })).body.error.code).toBe(
      "not_being_worked",
    );
    // And it can't be moved to another station any more (03 §5.4).
    expect(
      (await post(id, "dispatch", hq, { stationId: pettah, reason: "Moving it" })).body.error.code,
    ).toBe("too_late_to_dispatch");
  });

  it("when the OIC investigated, HQ decides (S2)", async () => {
    const { id } = await readyCase(fortOic);
    await post(id, "recommend", fortOic, {
      outcome: "penalty_notice",
      addressee: "owner",
      justification: "OIC stopped the vehicle personally.",
    });
    const self = await post(id, "decide", fortOic, { action: "approve" });
    expect(self.body.error.code).toBe("separation_of_duties");
    expect((await post(id, "decide", hq, { action: "approve" })).status).toBe(200);
  });

  it("sends back for more work, and a changed outcome needs a reason", async () => {
    const { id } = await readyCase(fortOfficer2);
    await post(id, "recommend", fortOfficer2, {
      outcome: "penalty_notice",
      addressee: "owner",
      justification: "Owner traced, photo clear.",
    });
    await post(id, "decide", fortOic, {
      action: "send_back",
      reason: "Get a statement from the owner first.",
    });
    let c = (await getCase(id)).body;
    expect(c).toMatchObject({ status: "investigating", recommendation: null });

    await post(id, "recommend", fortOfficer2, {
      outcome: "penalty_notice",
      addressee: "owner",
      justification: "Owner admits driving.",
    });
    const changed = await post(id, "decide", fortOic, {
      action: "change",
      outcome: "warning",
      addressee: "owner",
      reason: "First offence, minor — a warning is proportionate.",
    });
    expect(changed.status).toBe(200);
    c = (await getCase(id)).body;
    // A warning is finished at decision (C4).
    expect(c).toMatchObject({
      status: "closed",
      decision: { outcome: "warning", changed: true },
      closedReason: "Warning issued",
    });
  });

  it("no further action closes the case, and HQ can reopen it", async () => {
    const { id } = await readyCase(fortOfficer1);
    await post(id, "recommend", fortOfficer1, {
      outcome: "nfa",
      nfaReason: "owner_not_traced",
      justification: "The plate belongs to a scrapped vehicle.",
    });
    await post(id, "decide", fortOic, { action: "approve" });
    expect((await getCase(id)).body.status).toBe("closed");
    expect(
      (await post(id, "reopen", fortOic, { reason: "New footage arrived today" })).status,
    ).toBe(403);
    expect((await post(id, "reopen", hq, { reason: "New footage arrived today" })).status).toBe(
      200,
    );
    expect((await getCase(id)).body.status).toBe("investigating");
  });

  it("HQ overrides a decision back to awaiting decision (03 §8)", async () => {
    const { id } = await readyCase(fortOfficer1);
    await post(id, "recommend", fortOfficer1, {
      outcome: "penalty_notice",
      addressee: "owner",
      justification: "Clear evidence.",
    });
    await post(id, "decide", fortOic, { action: "approve" });
    expect((await post(id, "override", fortOic, { reason: "Wrong owner was traced" })).status).toBe(
      403,
    );
    expect(
      (await post(id, "override", hq2, { reason: "The DMT record was out of date" })).status,
    ).toBe(200);
    expect((await getCase(id)).body).toMatchObject({ status: "recommended", decision: null });
  });
});

describe("merging cases (03 §7)", () => {
  it("HQ merges two undecided cases; reports move and the source closes", async () => {
    const a = await newCase();
    const b = await newCase();
    const res = await post(a, "merge", hq, {
      intoCaseId: b,
      reason: "Same car, same time, two reports",
    });
    expect(res.status).toBe(200);
    const source = (await getCase(a)).body;
    const target = (await getCase(b)).body;
    expect(source).toMatchObject({ status: "closed" });
    expect(source.closedReason).toContain(target.caseNumber);
    expect(target.reportIds).toHaveLength(2);
    expect(
      (await post(a, "merge", fortOic, { intoCaseId: b, reason: "Trying as OIC" })).status,
    ).toBe(403);
  });
});

describe("the citizen hears about the outcome (02 §9)", () => {
  it("writes 'action taken' to report_updates for mobile-app reporters", async () => {
    const { id } = await readyCase(fortOfficer1);
    const c = (await getCase(id)).body;
    // Turn the case's report into a mobile-app report for this check.
    const appId = new (await import("mongoose")).Types.ObjectId();
    await t.conn.collection("incident_reports").updateOne(
      { reportNumber: c.reportIds[0].reportNumber },
      {
        $set: {
          channel: "citizen_app",
          sourceReportId: appId,
          "reporter.kind": "citizen",
          "reporter.userId": "citizen-1",
        },
      },
    );
    await post(id, "recommend", fortOfficer1, {
      outcome: "penalty_notice",
      addressee: "owner",
      justification: "Clear evidence.",
    });
    await post(id, "decide", fortOic, { action: "approve" });
    const update = await t.conn.collection("report_updates").findOne({ reportId: appId });
    expect(update).toMatchObject({ type: "action_taken", title: "Action taken" });
    expect(JSON.stringify(update)).not.toMatch(/penalty|Rs |Fort/);
  });
});

describe("officer leaving (03 §6, 01 §7)", () => {
  it("a deactivated officer's open cases go back to the OIC's 'no officer' queue", async () => {
    const leaver = await createStaff(t, { role: "station_officer", stationId: fort });
    const token = (await signIn(t, leaver)).token;
    const id = await newCase();
    await post(id, "accept", token);
    expect((await getCase(id)).body.investigatingOfficerId).toBe(leaver.id);

    const res = await t
      .http()
      .post(`/api/v1/users/${leaver.id}/deactivate`)
      .set(bearer(hq))
      .send({ reason: "Retired from service" });
    expect(res.status).toBe(200);
    const c = (await getCase(id)).body;
    expect(c.investigatingOfficerId).toBeNull();
    const queue = await t
      .http()
      .get("/api/v1/cases?view=no_officer&pageSize=100")
      .set(bearer(fortOic));
    expect(queue.body.items.some((x: { id: string }) => x.id === id)).toBe(true);
  });
});

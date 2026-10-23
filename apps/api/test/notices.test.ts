// Penalty notices — docs/05 §5–6: issue on decision, service, nomination,
// dispute, overdue and court referral, withdrawal, public look-up.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NoticesService } from "../src/modules/notices/notices.service";
import { publishPublicSchedule, seedOffenceSchedule } from "../src/modules/offences/schedule.data";
import { bearer, createStaff, createTestApp, signIn, type TestApp } from "./helpers";

let t: TestApp;
let notices: NoticesService;
let fort: string;
let kandy: string;
let hq: string;
let officer: string;
let oic: string;
let kandyOfficer: string;

const DAY = 86_400_000;
const post = (path: string, token: string, body: object = {}) =>
  t.http().post(`/api/v1/${path}`).set(bearer(token)).send(body);

async function station(name: string, lng: number, lat: number) {
  const [s] = await t.stations.create([
    { name, isActive: true, verified: true, location: { type: "Point", coordinates: [lng, lat] } },
  ]);
  return String(s!._id);
}

/** Report → case → trace → review → recommend → OIC approves a penalty notice. Returns the notice. */
async function decidedNotice(
  owner: { name: string; nic: string; phone?: string } = {
    name: "Kasun Perera",
    nic: `19${Math.floor(1e9 + Math.random() * 8e9)}`,
    phone: "0771234567",
  },
) {
  const report = await post("reports", hq, {
    channel: "whatsapp",
    reporter: { kind: "named", name: "Saman Kumara", phone: "0711111111" },
    occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
    location: { lat: 6.9344, lng: 79.8465 },
    address: "Chatham Street, Colombo 01",
    vehicleNumber: `WP CAB-${1000 + Math.floor(Math.random() * 8999)}`,
    vehicleType: "car",
    offenceCodes: ["MTA-157A", "MTA-155"],
    description: "Driver without a seat belt, sounding the horn continuously.",
  });
  const accepted = await post(`reports/${report.body.id}/accept`, hq, {
    offenceCodes: ["MTA-157A", "MTA-155"],
    vehicleNumber: report.body.vehicleNumber,
    vehicleType: "car",
    location: { lat: 6.9344, lng: 79.8465 },
    address: "Chatham Street, Colombo 01",
    occurredAt: report.body.occurredAt,
    priority: "P2",
    noEvidenceReason: "Two officers saw it",
  });
  const caseId = accepted.body.caseId as string;
  await post(`cases/${caseId}/accept`, officer);
  const person = await post("persons", officer, {
    type: "individual",
    name: owner.name,
    nic: owner.nic,
    address: "12 Main Street, Colombo 11",
    phone: owner.phone,
  });
  await post(`cases/${caseId}/vehicle-trace`, officer, {
    plate: report.body.vehicleNumber,
    type: "car",
    ownerId: person.body.id,
    dmtReference: "DMT/1",
  });
  await t.http().put(`/api/v1/cases/${caseId}/evidence-review`).set(bearer(officer)).send({
    plateReadable: true,
    vehicleMatches: true,
    timePlaceConsistent: true,
    notEdited: true,
    offenceVisible: true,
  });
  await post(`cases/${caseId}/recommend`, officer, {
    outcome: "penalty_notice",
    addressee: "owner",
    justification: "Clear evidence, owner traced.",
  });
  const decided = await post(`cases/${caseId}/decide`, oic, { action: "approve" });
  if (decided.status !== 200) throw new Error(JSON.stringify(decided.body));
  const list = await t.http().get(`/api/v1/cases/${caseId}/notices`).set(bearer(oic));
  return {
    caseId,
    notice: list.body[0] as { id: string; noticeNumber: string; amount: number; status: string },
    nic: owner.nic,
  };
}

const getNotice = (id: string, token = oic) =>
  t.http().get(`/api/v1/notices/${id}`).set(bearer(token));
const postIt = (id: string) =>
  post(`notices/${id}/post`, officer, {
    postedAt: new Date().toISOString(),
    postReference: "RL 123 456 789 LK",
  });

beforeAll(async () => {
  t = await createTestApp();
  await seedOffenceSchedule(t.conn, true);
  await publishPublicSchedule(t.conn);
  notices = t.app.get(NoticesService);
  fort = await station("Fort", 79.8465, 6.9344);
  kandy = await station("Kandy", 80.6337, 7.2906);
  hq = (await signIn(t, await createStaff(t, { role: "hq" }))).token;
  officer = (await signIn(t, await createStaff(t, { role: "station_officer", stationId: fort })))
    .token;
  oic = (await signIn(t, await createStaff(t, { role: "station_oic", stationId: fort }))).token;
  kandyOfficer = (
    await signIn(t, await createStaff(t, { role: "station_officer", stationId: kandy }))
  ).token;
});
afterAll(() => t.close());

describe("issue and service (05 §5)", () => {
  it("issues a notice on a penalty-notice decision, with fines copied from the schedule", async () => {
    const { notice } = await decidedNotice();
    expect(notice.noticeNumber).toMatch(/^PN-\d{4}-\d{6}$/);
    expect(notice).toMatchObject({ status: "issued", amount: 2_000 }); // Rs 1,000 + Rs 1,000 (D05-1)
    const d = (await getNotice(notice.id)).body;
    expect(d.lines.map((l: { code: string }) => l.code).sort()).toEqual(["MTA-155", "MTA-157A"]);
    expect(d.can.post).toBe(true);
    expect((await getNotice(notice.id, kandyOfficer)).status).toBe(404);
  });

  it("posting serves it 3 days later with 14 days to respond, and holds a letter and an SMS", async () => {
    const { notice } = await decidedNotice();
    const res = await postIt(notice.id);
    expect(res.status).toBe(200);
    const d = res.body;
    const served = new Date(d.servedAt).getTime();
    expect(Math.round((served - Date.now()) / DAY)).toBe(3);
    expect(Math.round((new Date(d.dueDate).getTime() - served) / DAY)).toBe(14);

    const held = await t.conn
      .collection("outbox_messages")
      .find({ noticeNumber: notice.noticeNumber })
      .toArray();
    expect(held.map((m) => m.channel).sort()).toEqual(["post", "sms"]);
    const sms = held.find((m) => m.channel === "sms")!;
    expect(sms.body).not.toMatch(/seat belt|horn|Rs/); // SMS never carries offence details (05 §5.1)
    expect(held.find((m) => m.channel === "post")!.body).toContain("Seat belt not worn");
  });
});

describe("public look-up (07 §5.1)", () => {
  it("needs the notice number and the addressee's ID number, and masks the name", async () => {
    const { notice, nic } = await decidedNotice({
      name: "Nimal Bandara Silva",
      nic: "198522334455",
    });
    await postIt(notice.id);
    const wrong = await post("public/notices/lookup", hq, {
      noticeNumber: notice.noticeNumber,
      idNumber: "199011112222",
    });
    expect(wrong.status).toBe(404);
    const ok = await t
      .http()
      .post("/api/v1/public/notices/lookup")
      .send({ noticeNumber: notice.noticeNumber, idNumber: nic });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      amount: 2_000,
      payable: true,
      canNominate: true,
      canDispute: true,
      addresseeMasked: "N. B. S****",
    });
    expect(JSON.stringify(ok.body)).not.toMatch(/Saman|0711111111/); // never the reporter
  });
});

describe("naming the driver (05 §6.2)", () => {
  it("the owner names the driver; the officer accepts; a new notice goes to the driver", async () => {
    const { caseId, notice, nic } = await decidedNotice();
    await postIt(notice.id);
    const named = await t.http().post("/api/v1/public/notices/nominate").send({
      noticeNumber: notice.noticeNumber,
      idNumber: nic,
      driverName: "Ruwan Jayasinghe",
      driverId: "199233445566",
      driverAddress: "7 Temple Road, Kelaniya",
      declaration: true,
    });
    expect(named.body.status).toBe("nominated");
    const again = await t.http().post("/api/v1/public/notices/nominate").send({
      noticeNumber: notice.noticeNumber,
      idNumber: nic,
      driverName: "Someone Else",
      driverId: "199099887766",
      driverAddress: "Somewhere 1",
      declaration: true,
    });
    expect(again.status).toBe(409);

    const reviewed = await post(`notices/${notice.id}/nomination/review`, officer, {
      action: "accept",
    });
    expect(reviewed.body.status).toBe("transferred");
    const all = (await t.http().get(`/api/v1/cases/${caseId}/notices`).set(bearer(oic))).body;
    const child = all.find((n: { id: string }) => n.id === reviewed.body.childNoticeId);
    expect(child).toMatchObject({
      status: "issued",
      addresseeName: "Ruwan Jayasinghe",
      amount: 2_000,
    });
    expect((await t.http().get(`/api/v1/cases/${caseId}`).set(bearer(oic))).body.driver.name).toBe(
      "Ruwan Jayasinghe",
    );

    // The driver can't name someone else.
    await postIt(child.id);
    const driverNominates = await post(`notices/${child.id}/nomination`, officer, {
      driverName: "X Y",
      driverId: "199011223344",
      driverAddress: "Anywhere 2",
      declaration: true,
    });
    expect(driverNominates.body.error.code).toBe("cannot_nominate");
  });
});

describe("disputes (05 §6.3)", () => {
  it("one dispute only; a rejected dispute gives 7 more days", async () => {
    const { notice, nic } = await decidedNotice();
    await postIt(notice.id);
    const d = await t.http().post("/api/v1/public/notices/dispute").send({
      noticeNumber: notice.noticeNumber,
      idNumber: nic,
      ground: "evidence_wrong",
      explanation: "I was wearing my seat belt; the photo is from another day.",
    });
    expect(d.body.status).toBe("disputed");
    expect(
      (
        await post(`notices/${notice.id}/dispute/review`, officer, {
          action: "reject",
          reason: "The photo is time-stamped",
        })
      ).status,
    ).toBe(403);
    const rejected = await post(`notices/${notice.id}/dispute/review`, oic, {
      action: "reject",
      reason: "The CCTV time stamp matches the report.",
    });
    expect(rejected.body.status).toBe("served");
    expect(Math.round((new Date(rejected.body.dueDate).getTime() - Date.now()) / DAY)).toBe(7);
    const second = await t.http().post("/api/v1/public/notices/dispute").send({
      noticeNumber: notice.noticeNumber,
      idNumber: nic,
      ground: "other",
      explanation: "Trying a second dispute on the same notice.",
    });
    expect(second.body.error.code).toBe("already_disputed");
  });

  it("an upheld dispute withdraws the notice and sends the case back for a new decision", async () => {
    const { caseId, notice } = await decidedNotice();
    await postIt(notice.id);
    await post(`notices/${notice.id}/dispute`, officer, {
      ground: "sold_or_stolen",
      explanation: "Owner produced the sale deed dated a week before the offence.",
    });
    const upheld = await post(`notices/${notice.id}/dispute/review`, oic, {
      action: "uphold",
      reason: "Sale deed verified with the DMT.",
    });
    expect(upheld.body.status).toBe("withdrawn");
    expect((await t.http().get(`/api/v1/cases/${caseId}`).set(bearer(oic))).body.status).toBe(
      "recommended",
    );
  });
});

describe("not responding (05 §6.4)", () => {
  it("goes overdue with a reminder, then proposes court; the OIC confirms", async () => {
    const { notice } = await decidedNotice();
    await postIt(notice.id);
    const after = new Date(Date.now() + 18 * DAY);
    const first = await notices.sweep(after);
    expect(first.overdue).toBeGreaterThanOrEqual(1);
    let d = (await getNotice(notice.id)).body;
    expect(d.status).toBe("overdue");
    expect(
      await t.conn
        .collection("outbox_messages")
        .countDocuments({ noticeNumber: notice.noticeNumber, template: "reminder" }),
    ).toBe(1);

    const later = new Date(Date.now() + 40 * DAY);
    const second = await notices.sweep(later);
    expect(second.proposed).toBeGreaterThanOrEqual(1);
    d = (await getNotice(notice.id)).body;
    expect(d.flags).toContain("court_proposed");
    expect((await post(`notices/${notice.id}/court`, officer)).status).toBe(403);
    expect((await post(`notices/${notice.id}/court`, oic)).body.status).toBe("court_referral");
  });
});

describe("withdrawal", () => {
  it("HQ withdraws a notice; the case closes (C4)", async () => {
    const { caseId, notice } = await decidedNotice();
    expect(
      (await post(`notices/${notice.id}/withdraw`, oic, { reason: "Trying as the OIC" })).status,
    ).toBe(403);
    const res = await post(`notices/${notice.id}/withdraw`, hq, {
      reason: "Wrong vehicle on the DMT record",
    });
    expect(res.body.status).toBe("withdrawn");
    expect((await t.http().get(`/api/v1/cases/${caseId}`).set(bearer(hq))).body.status).toBe(
      "closed",
    );
  });

  it("an HQ override of the decision withdraws the running notice", async () => {
    const { caseId, notice } = await decidedNotice();
    await post(`cases/${caseId}/override`, hq, {
      reason: "Owner traced from an out-of-date record",
    });
    expect((await getNotice(notice.id)).body.status).toBe("withdrawn");
  });
});

describe("public look-up limits (07 D07-1)", () => {
  it("blocks after 5 failed look-ups in 10 minutes, even a correct one", async () => {
    // The counter is per IP and earlier tests already failed once from this one.
    const { notice, nic } = await decidedNotice();
    const tries: number[] = [];
    for (let i = 0; i < 6; i++) {
      tries.push(
        (
          await t
            .http()
            .post("/api/v1/public/notices/lookup")
            .send({ noticeNumber: "PN-2026-999999", idNumber: "199000000000" })
        ).status,
      );
    }
    const firstBlock = tries.indexOf(429);
    expect(firstBlock).toBeGreaterThan(0);
    expect(tries.slice(0, firstBlock).every((s) => s === 404)).toBe(true);
    expect(tries.slice(firstBlock).every((s) => s === 429)).toBe(true);
    const correct = await t
      .http()
      .post("/api/v1/public/notices/lookup")
      .send({ noticeNumber: notice.noticeNumber, idNumber: nic });
    expect(correct.status).toBe(429);
  });
});

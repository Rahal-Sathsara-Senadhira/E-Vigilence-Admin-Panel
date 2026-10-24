// Payments — docs/07: online payment through the simulator with signed
// confirmations (references once only, amounts checked), bank delay,
// double payments refunded, receipts recorded and reviewed (S3), refunds
// approved by HQ.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifyAuditChain } from "#src/core/audit/audit.js";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { Case } from "#src/modules/cases/index.js";
import { Notice, OutboxMessage } from "#src/modules/notices/notice.model.js";
import { OffenceVersion } from "#src/modules/offences/offences.model.js";
import { Station } from "#src/modules/organisation/organisation.model.js";
import { Payment } from "#src/modules/payments/payment.model.js";
import { simulatorLimiter } from "#src/modules/payments/payments.routes.js";
import { paymentLookupLimiter, runPaymentSweep } from "#src/modules/payments/payments.service.js";
import { CSRF, createTestApp, createUser, signInAs } from "./helpers/app.js";

/** @type {Awaited<ReturnType<typeof createTestApp>>} */
let t;
/** @type {Record<string, ReturnType<typeof as>>} */
const u = {};
/** @type {Record<string, string>} */
const tokens = {};
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
/** The payer and the simulator: no sign-in. */
const pub = {
  get: (/** @type {string} */ p) => t.http().get(`/api/v1/public/payments${p}`),
  post: (/** @type {string} */ p, /** @type {object} */ b) =>
    t.http().post(`/api/v1/public/payments${p}`).set(CSRF).send(b),
};

const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(1024, 9),
  Buffer.from([0xff, 0xd9]),
]);

/** A served Rs. 3,500 notice to an owner with a NIC. */
async function servedNotice() {
  seq += 1;
  const plate = `SP PY-${String(3000 + seq)}`;
  const nic = `${String(500000000 + seq)}V`;
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
    name: `Payer ${seq}`,
    nic,
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
  await u.officer?.post(`/cases/${caseId}/recommend`, {
    outcome: "penalty_notice",
    addressee: "owner",
    justification: "Clear evidence of both offences.",
  });
  await u.oic?.post(`/cases/${caseId}/decide`, { action: "approve" });
  const n = await Notice.findOne({ caseId }).lean();
  await u.clerk?.post(`/notices/${n?._id}/posted`, {});
  return {
    caseId: String(caseId),
    noticeId: String(n?._id),
    noticeNumber: String(n?.noticeNumber),
    nic,
    plate,
  };
}

/** Starts and finishes an online payment with an outcome. @param {{ noticeNumber: string, nic: string }} n @param {string} outcome */
async function payOnline(n, outcome = "success") {
  const start = await pub.post("/start", { noticeNumber: n.noticeNumber, idNumber: n.nic });
  expect(start.status).toBe(201);
  const res = await pub.post(`/sim/${start.body.sessionId}/outcome`, { method: "card", outcome });
  return { sessionId: start.body.sessionId, res };
}

beforeAll(async () => {
  t = await createTestApp();
  await OffenceVersion.create(
    /** @type {any[]} */ (
      [
        ["MTA-A", 1000],
        ["MTA-B", 2500],
      ].map(([code, fine]) => ({
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
      }))
    ),
  );
  const [kandy] = await Station.create(
    /** @type {any[]} */ ([
      {
        name: "Kandy Police Station",
        code: "KDY",
        verified: true,
        location: { type: "Point", coordinates: [80.6337, 7.2906] },
      },
    ]),
  );
  const accounts = {
    hq: await createUser({ role: "hq_operator" }),
    supervisor: await createUser({ role: "hq_supervisor" }),
    officer: await createUser({ role: "traffic_officer", stationId: kandy?._id }),
    oic: await createUser({ role: "station_oic", stationId: kandy?._id }),
    clerk: await createUser({ role: "station_clerk", stationId: kandy?._id }),
    finance: await createUser({ role: "finance_officer" }),
    finance2: await createUser({ role: "finance_officer" }),
  };
  for (const [k, user] of Object.entries(accounts)) {
    tokens[k] = await signInAs(t, user);
    u[k] = as(tokens[k]);
  }
});
afterAll(() => t.close());
beforeEach(() => {
  signInLimiter.reset();
  paymentLookupLimiter.reset();
  simulatorLimiter.reset();
});

describe("paying online (simulator)", () => {
  it("needs the notice number and the addressee's ID; 5 failed tries then a block", async () => {
    const n = await servedNotice();
    for (let i = 0; i < 5; i += 1) {
      expect(
        (await pub.post("/start", { noticeNumber: n.noticeNumber, idNumber: "199999999999" }))
          .status,
      ).toBe(404);
    }
    expect(
      (await pub.post("/start", { noticeNumber: n.noticeNumber, idNumber: n.nic })).status,
    ).toBe(429);
  });

  it("success: the signed confirmation marks the notice paid and the case closes", async () => {
    const n = await servedNotice();
    const { sessionId, res } = await payOnline(n);
    expect(res.body).toMatchObject({
      status: "succeeded",
      amount: 3500,
      reference: expect.stringMatching(/^SIM-[A-Z0-9]{10}$/),
    });
    const receipt = await pub.get(`/receipt/${sessionId}`);
    expect(receipt.body).toMatchObject({
      noticeNumber: n.noticeNumber,
      amount: 3500,
      method: "sim_card",
    });
    expect(await Notice.findById(n.noticeId).lean()).toMatchObject({
      status: "paid",
      paymentReference: res.body.reference,
    });
    expect((await Case.findById(n.caseId).lean())?.status).toBe("closed");
    const sms = await OutboxMessage.findOne({ noticeId: n.noticeId, kind: "receipt" }).lean();
    expect(sms?.text).toContain(res.body.reference);
    // Already paid: nothing more to pay.
    const again = await pub.post("/start", { noticeNumber: n.noticeNumber, idNumber: n.nic });
    expect(again.body.error.message).toMatch(/already paid/);
  });

  it("declined and cancelled leave the notice unpaid; bank delay confirms after a minute", async () => {
    const n = await servedNotice();
    expect((await payOnline(n, "declined")).res.body).toMatchObject({
      status: "failed",
      failureReason: "declined",
    });
    expect((await payOnline(n, "cancel")).res.body).toMatchObject({
      status: "failed",
      failureReason: "cancelled",
    });
    expect((await Notice.findById(n.noticeId).lean())?.status).toBe("served");
    const delayed = await payOnline(n, "delay");
    expect(delayed.res.body).toMatchObject({ status: "pending", bankDelay: true });
    expect(await runPaymentSweep(new Date(Date.now() + 2 * 60_000))).toMatchObject({
      confirmed: 1,
    });
    expect((await Notice.findById(n.noticeId).lean())?.status).toBe("paid");
  });

  it("confirmations: a bad signature is refused, a replay is processed only once", async () => {
    const n = await servedNotice();
    const { sessionId } = await payOnline(n);
    const p = await Payment.findOne({ sessionId }).lean();
    const payload = JSON.parse(String(p?.confirmation?.payload));
    const replay = await t
      .http()
      .post("/api/v1/public/payments/confirm")
      .set("X-Signature", String(p?.confirmation?.signature))
      .send(payload);
    expect(replay.status).toBe(409);
    const forged = await t
      .http()
      .post("/api/v1/public/payments/confirm")
      .set("X-Signature", String(p?.confirmation?.signature))
      .send({ ...payload, reference: "SIM-FORGED0001" });
    expect(forged.status).toBe(401);
  });

  it("a second payment for the same notice is refunded automatically", async () => {
    const n = await servedNotice();
    const first = await pub.post("/start", { noticeNumber: n.noticeNumber, idNumber: n.nic });
    const second = await pub.post("/start", { noticeNumber: n.noticeNumber, idNumber: n.nic });
    await pub.post(`/sim/${first.body.sessionId}/outcome`, { method: "card", outcome: "success" });
    const res = await pub.post(`/sim/${second.body.sessionId}/outcome`, {
      method: "wallet",
      outcome: "success",
    });
    expect(res.body).toMatchObject({ status: "succeeded", refunded: true });
    const p = await Payment.findOne({ sessionId: second.body.sessionId }).lean();
    expect(p).toMatchObject({
      flags: ["double_payment"],
      refund: { status: "refunded", automatic: true },
    });
    expect(p?.refund?.reference).toMatch(/^SIMR-/);
  });

  it("paying during a dispute closes the dispute (D07-6)", async () => {
    const n = await servedNotice();
    await u.clerk?.post(`/notices/${n.noticeId}/responses`, {
      type: "dispute",
      grounds: "evidence_wrong",
      explanation: "I think the photo is of another car.",
    });
    await payOnline(n);
    expect(await Notice.findById(n.noticeId).lean()).toMatchObject({
      status: "paid",
      dispute: { review: { result: "withdrawn_by_payment" } },
    });
  });
});

describe("recorded receipts and refunds", () => {
  /** @param {string} token @param {string} noticeId @param {Record<string, string>} fields @param {Buffer} [file] */
  const receipt = (token, noticeId, fields, file = jpeg) => {
    let req = t
      .http()
      .post(`/api/v1/payments/receipts/${noticeId}`)
      .set(CSRF)
      .set("Authorization", `Bearer ${token}`);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req.attach("file", file, "receipt.jpg");
  };
  const fields = (/** @type {string} */ number, amount = "3500") => ({
    method: "receipt_post_office",
    receiptNumber: number,
    amount,
    paidOn: new Date().toISOString(),
  });

  it("the amount must match and a scan is required; HQ reviews, never the recorder (S3)", async () => {
    const n = await servedNotice();
    expect((await receipt(tokens.clerk ?? "", n.noticeId, fields("PO-1001", "1000"))).status).toBe(
      400,
    );
    expect(
      (
        await receipt(
          tokens.clerk ?? "",
          n.noticeId,
          fields("PO-1001"),
          Buffer.from("not an image at all"),
        )
      ).status,
    ).toBe(400);
    const recorded = await receipt(tokens.clerk ?? "", n.noticeId, fields("PO-1001"));
    expect(recorded.status).toBe(201);
    expect((await Notice.findById(n.noticeId).lean())?.status).toBe("paid");

    const queue = await u.finance?.get("/payments?view=receipts_to_review");
    expect(queue?.body.items.map((/** @type {any} */ p) => p.id)).toContain(recorded.body.id);
    expect(
      (await u.clerk?.post(`/payments/${recorded.body.id}/review`, { result: "confirmed" }))
        ?.status,
    ).toBe(403);
    const reversed = await u.finance?.post(`/payments/${recorded.body.id}/review`, {
      result: "reversed",
      reason: "The post office says this receipt number is for another fine.",
    });
    expect(reversed?.body).toMatchObject({ status: "reversed", review: { result: "reversed" } });
    expect((await Notice.findById(n.noticeId).lean())?.status).toBe("served");
  });

  it("the recorder can't review their own receipt (S3)", async () => {
    const n = await servedNotice();
    const recorded = await receipt(tokens.finance ?? "", n.noticeId, fields("BANK-2002"));
    const own = await u.finance?.post(`/payments/${recorded.body.id}/review`, {
      result: "confirmed",
    });
    expect(own?.status).toBe(403);
    expect(
      (await u.finance2?.post(`/payments/${recorded.body.id}/review`, { result: "confirmed" }))
        ?.body.review.result,
    ).toBe("confirmed");
  });

  it("a paid notice withdrawn by HQ: refund due, approved by finance", async () => {
    const n = await servedNotice();
    const { sessionId } = await payOnline(n);
    await u.supervisor?.post(`/notices/${n.noticeId}/withdraw`, {
      reason: "Wrong owner traced; the car was sold before the offence.",
    });
    const p = await Payment.findOne({ sessionId }).lean();
    expect(p?.refund).toMatchObject({ status: "due" });
    const due = await u.finance?.get("/payments?view=refunds_due");
    expect(due?.body.items.map((/** @type {any} */ x) => x.id)).toContain(String(p?._id));
    const res = await u.finance?.post(`/payments/${p?._id}/refund`);
    expect(res?.body.refund).toMatchObject({
      status: "refunded",
      reference: expect.stringMatching(/^SIMR-/),
    });
  });

  it("keeps the audit chain intact", async () => {
    expect(await verifyAuditChain()).toBeNull();
  });
});

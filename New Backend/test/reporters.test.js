// Reporter abuse and the no-response rule — docs/02 §6.3, §10.

import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifyAuditChain } from "#src/core/audit/audit.js";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { OffenceVersion } from "#src/modules/offences/offences.model.js";
import { ReporterAccount } from "#src/modules/reporters/reporter-account.model.js";
import { receiveFromApp, rejectUnanswered } from "#src/modules/reports/index.js";
import { Report } from "#src/modules/reports/report.model.js";
import { CSRF, createTestApp, createUser, signInAs } from "./helpers/app.js";

/** @type {Awaited<ReturnType<typeof createTestApp>>} */
let t;
/** @type {ReturnType<typeof as>} */ let operator;
/** @type {ReturnType<typeof as>} */ let supervisor;
const DAY = 86_400_000;
const db = () => /** @type {import("mongodb").Db} */ (mongoose.connection.db);

/** @param {string} token */
const as = (token) => ({
  get: (/** @type {string} */ p) =>
    t.http().get(`/api/v1${p}`).set("Authorization", `Bearer ${token}`),
  post: (/** @type {string} */ p, /** @type {object} */ b = {}) =>
    t.http().post(`/api/v1${p}`).set(CSRF).set("Authorization", `Bearer ${token}`).send(b),
});

/** A mobile-app report from `userId`, as the import creates it. @param {string} userId */
async function appReport(userId) {
  const created = await receiveFromApp(
    {
      appReportId: new mongoose.Types.ObjectId(),
      clientReportId: null,
      userId,
      reporterName: "Kamal Silva",
      reporterPhone: "+94771234567",
      receivedAt: new Date(),
      occurredAt: new Date(Date.now() - 3_600_000),
      location: { lat: 6.9271, lng: 79.8612 },
      address: "Galle Road",
      vehicleNumber: "WP CAB-4521",
      vehicleType: "car",
      vehicleDescription: null,
      offenceCodes: ["MTA-157A"],
      description: "Driver without a seat belt on Galle Road.",
      injuries: false,
      priority: "P2",
      flags: [],
      rejection: null,
    },
    [],
  );
  return /** @type {NonNullable<typeof created>} */ (created).id;
}

beforeAll(async () => {
  t = await createTestApp();
  await OffenceVersion.create({
    code: "MTA-157A",
    version: 1,
    name: "Seat belt",
    legalReference: "s. 157A",
    outcome: "spot_fine",
    spotFine: 1000,
    severity: "minor",
    citizenReportable: true,
    publicName: "No seat belt",
    publicDescription: "Seat belt not worn.",
    active: true,
    effectiveFrom: new Date(Date.now() - DAY),
    current: true,
    source: "test",
    changedBy: "test",
    reason: "test",
  });
  operator = as(await signInAs(t, await createUser({ role: "hq_operator" })));
  supervisor = as(await signInAs(t, await createUser({ role: "hq_supervisor" })));
});
afterAll(() => t.close());
beforeEach(() => signInLimiter.reset());

describe("reporter abuse", () => {
  it("flags a reporter on the third false or abusive report, and warns triage", async () => {
    const userId = "app-user-abuse";
    for (const reasonCode of ["fabricated", "abusive"]) {
      const id = await appReport(userId);
      expect((await operator.post(`/reports/${id}/reject`, { reasonCode })).status).toBe(200);
    }
    // Other reasons don't count.
    const other = await appReport(userId);
    await operator.post(`/reports/${other}/reject`, { reasonCode: "insufficient_evidence" });
    expect((await ReporterAccount.findOne({ userId }).lean())?.status ?? "active").toBe("active");

    const third = await appReport(userId);
    await operator.post(`/reports/${third}/reject`, { reasonCode: "fabricated" });
    const account = await ReporterAccount.findOne({ userId }).lean();
    expect(account).toMatchObject({ status: "flagged", statusChangedBy: expect.any(String) });
    expect(account?.statusReason).toMatch(/3 reports rejected as false or abusive within 90 days/);

    // Their next report carries the warning, in the record and in the queue.
    const next = await appReport(userId);
    const res = await operator.get(`/reports/${next}`);
    expect(res.body).toMatchObject({
      reporterStanding: { status: "flagged" },
      abuse: { count: 3, threshold: 3, days: 90 },
      can: { suspendReporter: false, reinstateReporter: false },
    });
    const queue = await operator.get("/reports?view=triage");
    expect(queue.body.items.find((/** @type {any} */ r) => r.id === next)).toMatchObject({
      reporterStanding: { status: "flagged" },
    });
    expect((await supervisor.get(`/reports/${next}`)).body.can).toMatchObject({
      suspendReporter: true,
      reinstateReporter: true,
    });
  });

  it("rejections older than the period don't count", async () => {
    const userId = "app-user-old";
    const ids = [await appReport(userId), await appReport(userId)];
    for (const id of ids) await operator.post(`/reports/${id}/reject`, { reasonCode: "abusive" });
    await Report.updateMany(
      { "source.userId": userId },
      { $set: { "triage.decidedAt": new Date(Date.now() - 100 * DAY) } },
    );
    const third = await appReport(userId);
    await operator.post(`/reports/${third}/reject`, { reasonCode: "abusive" });
    expect((await ReporterAccount.findOne({ userId }).lean())?.status ?? "active").toBe("active");
  });

  it("only an HQ supervisor suspends, with a reason; the import then refuses the reporter", async () => {
    const userId = "app-user-suspend";
    expect(
      (await operator.post(`/reporters/${userId}/suspend`, { reason: "Repeated fake reports." }))
        .status,
    ).toBe(403);
    expect(
      (await supervisor.post(`/reporters/${userId}/suspend`, { reason: "short" })).status,
    ).toBe(400);
    const res = await supervisor.post(`/reporters/${userId}/suspend`, {
      reason: "Repeated fake reports with edited photos.",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "suspended", history: [{ status: "suspended" }] });
    expect(
      (await supervisor.post(`/reporters/${userId}/suspend`, { reason: "Again, by mistake." }))
        .status,
    ).toBe(409);

    // The app reads the same document (docs/11 §6).
    expect(await db().collection("reward_accounts").findOne({ userId })).toMatchObject({
      status: "suspended",
    });
    const list = await supervisor.get("/reporters?status=suspended");
    expect(list.body.items.map((/** @type {any} */ a) => a.userId)).toContain(userId);

    const lifted = await supervisor.post(`/reporters/${userId}/reinstate`, {
      reason: "Appeal accepted after review.",
    });
    expect(lifted.body).toMatchObject({ status: "active" });
    expect(lifted.body.history).toHaveLength(2);
  });
});

describe("no answer from the reporter", () => {
  it("rejects a report after 7 days without an answer, and tells the reporter", async () => {
    const late = await appReport("app-user-late");
    const recent = await appReport("app-user-recent");
    for (const id of [late, recent]) {
      const res = await operator.post(`/reports/${id}/ask`, {
        question: "Which way was the car going?",
      });
      expect(res.status).toBe(200);
      expect(res.body.answerDueAt).toBeTruthy();
    }
    await Report.updateOne(
      { _id: late },
      { $set: { "triage.askedAt": new Date(Date.now() - 8 * DAY) } },
    );

    expect(await rejectUnanswered()).toBe(1);
    const r = await Report.findById(late).lean();
    expect(r).toMatchObject({
      status: "rejected",
      triage: { reasonCode: "no_response", decidedBy: "Automatic (no answer)" },
    });
    expect((await Report.findById(recent).lean())?.status).toBe("needs_info");

    const update = await db()
      .collection("report_updates")
      .findOne({ reportId: r?.source?.appReportId, type: "rejected" });
    expect(update?.message).toMatch(/didn't receive the information/);

    // Nothing more to do on a second run.
    expect(await rejectUnanswered()).toBe(0);
  });

  it("keeps the audit chain intact", async () => {
    expect(await verifyAuditChain()).toBeNull();
  });
});

// Time limits — docs/09 T2, D09-8.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TimeLimitsService } from "../src/modules/settings/time-limits.service";
import { bearer, createStaff, createStation, createTestApp, signIn, type TestApp } from "./helpers";

let t: TestApp;
let limits: TimeLimitsService;
let hqToken: string;
let devToken: string;
let oicToken: string;

beforeAll(async () => {
  t = await createTestApp();
  limits = t.app.get(TimeLimitsService);
  const station = await createStation(t);
  hqToken = (await signIn(t, await createStaff(t, { role: "hq" }))).token;
  devToken = (await signIn(t, await createStaff(t, { role: "dev" }))).token;
  oicToken = (await signIn(t, await createStaff(t, { role: "station_oic", stationId: station })))
    .token;
});
afterAll(() => t.close());

describe("time limits", () => {
  it("lists every limit with its default to any staff member", async () => {
    const res = await t.http().get("/api/v1/settings/time-limits").set(bearer(oicToken));
    expect(res.status).toBe(200);
    const accept = res.body.find((l: { key: string }) => l.key === "case.accept");
    expect(accept).toMatchObject({ value: 24, unit: "hours", effectiveFrom: null });
  });

  it("only HQ can change a limit — not dev, not an OIC (D09-8)", async () => {
    const body = { value: 12, reason: "Faster acceptance pilot" };
    expect(
      (
        await t
          .http()
          .put("/api/v1/settings/time-limits/case.accept")
          .set(bearer(devToken))
          .send(body)
      ).status,
    ).toBe(403);
    expect(
      (
        await t
          .http()
          .put("/api/v1/settings/time-limits/case.accept")
          .set(bearer(oicToken))
          .send(body)
      ).status,
    ).toBe(403);
    const ok = await t
      .http()
      .put("/api/v1/settings/time-limits/case.accept")
      .set(bearer(hqToken))
      .send(body);
    expect(ok.status).toBe(200);
    expect(ok.body.value).toBe(12);
  });

  it("needs a reason and stays within the allowed range", async () => {
    const noReason = await t
      .http()
      .put("/api/v1/settings/time-limits/notice.respond")
      .set(bearer(hqToken))
      .send({ value: 21 });
    expect(noReason.status).toBe(400);
    const tooShort = await t
      .http()
      .put("/api/v1/settings/time-limits/notice.respond")
      .set(bearer(hqToken))
      .send({ value: 1, reason: "Make it very short" });
    expect(tooShort.body.error.code).toBe("out_of_range");
  });

  it("applies a change only to items that start after it — T2", async () => {
    const before = new Date();
    await new Promise((r) => setTimeout(r, 20));
    await t
      .http()
      .put("/api/v1/settings/time-limits/case.decide")
      .set(bearer(hqToken))
      .send({ value: 5, reason: "Allow more time for complex cases" });

    expect(await limits.limitAt("case.decide", before)).toBe(3); // started before: keeps 3 days
    expect(await limits.limitAt("case.decide", new Date())).toBe(5);
    expect(await limits.msAt("case.decide", before)).toBe(3 * 86_400_000);
  });

  it("keeps the history and writes the audit log", async () => {
    const history = await t
      .http()
      .get("/api/v1/settings/time-limits/case.accept/history")
      .set(bearer(oicToken));
    expect(history.body[0]).toMatchObject({
      value: 12,
      previous: 24,
      reason: "Faster acceptance pilot",
    });

    const audit = await t
      .http()
      .get("/api/v1/audit?targetType=time_limit&targetId=case.accept")
      .set(bearer(hqToken));
    expect(audit.body.items[0].summary).toMatch(/24 hours → 12 hours/);
  });
});

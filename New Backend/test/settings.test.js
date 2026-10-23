// Time limits — docs/09 T2: a change applies only to items that start after it.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { SettingVersion, limitAt } from "#src/modules/settings/settings.service.js";
import { CSRF, createTestApp, createUser, signInAs } from "./helpers/app.js";

/** @type {Awaited<ReturnType<typeof createTestApp>>} */
let t;
/** @type {string} */ let token;

const get = (/** @type {string} */ p) =>
  t.http().get(`/api/v1${p}`).set("Authorization", `Bearer ${token}`);
const put = (/** @type {string} */ p, /** @type {object} */ b) =>
  t.http().put(`/api/v1${p}`).set(CSRF).set("Authorization", `Bearer ${token}`).send(b);

beforeAll(async () => {
  t = await createTestApp();
  token = await signInAs(t, await createUser({ role: "hq_admin" }));
});
afterAll(() => t.close());
beforeEach(() => signInLimiter.reset());

describe("time limits", () => {
  it("lists every limit with its default", async () => {
    const res = await get("/settings/time-limits");
    const p1 = res.body.find((/** @type {any} */ l) => l.key === "reports.triage_p1");
    expect(p1).toMatchObject({
      value: 2,
      defaultValue: 2,
      unit: "hours",
      group: "Reports",
      changedAt: null,
    });
  });

  it("a change applies from now on, never to items that started before", async () => {
    const before = new Date(Date.now() - 60_000);
    const res = await put("/settings/time-limits/reports.triage_p1", {
      value: 4,
      reason: "Night-shift staffing at HQ",
    });
    expect(res.body).toMatchObject({
      value: 4,
      history: [{ value: 4, reason: "Night-shift staffing at HQ" }],
    });
    // An item that started before the change keeps the old 2-hour limit.
    expect((await limitAt("reports.triage_p1", before)).getTime() - before.getTime()).toBe(
      2 * 3_600_000,
    );
    const after = new Date(Date.now() + 1000);
    expect((await limitAt("reports.triage_p1", after)).getTime() - after.getTime()).toBe(
      4 * 3_600_000,
    );
  });

  it("refuses values out of range, no-op changes and unknown limits", async () => {
    expect(
      (
        await put("/settings/time-limits/reports.triage_lock", {
          value: 999,
          reason: "Typo test here",
        })
      ).body.error.fields.value,
    ).toMatch(/1 to 240 minutes/);
    expect(
      (
        await put("/settings/time-limits/reports.triage_p1", {
          value: 4,
          reason: "Same again value",
        })
      ).body.error.code,
    ).toBe("no_change");
    expect(
      (await put("/settings/time-limits/nope", { value: 4, reason: "Unknown key test" })).status,
    ).toBe(404);
    expect(await SettingVersion.countDocuments()).toBe(1);
  });

  it("only the HQ administrator can see or change them", async () => {
    const oic = await signInAs(t, await createUser({ role: "station_oic" }));
    expect(
      (await t.http().get("/api/v1/settings/time-limits").set("Authorization", `Bearer ${oic}`))
        .status,
    ).toBe(403);
  });
});

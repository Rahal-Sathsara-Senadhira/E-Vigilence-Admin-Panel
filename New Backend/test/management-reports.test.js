// Management reports — docs/12 §7: PDF and CSV files, on demand and on the
// 06:00 schedule, recorded runs with fingerprints, scope by role, and the
// same figures as the dashboard (D12-7).

import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditEntry } from "#src/core/audit/audit.js";
import { signInLimiter } from "#src/modules/auth/auth.routes.js";
import { clearDashboardCache } from "#src/modules/dashboard/dashboard.service.js";
import { renderCsv } from "#src/modules/management-reports/csv.js";
import {
  ReportRun,
  lastComplete,
  runScheduledReports,
} from "#src/modules/management-reports/management-reports.service.js";
import { renderPdf } from "#src/modules/management-reports/pdf.js";
import { Division, Station } from "#src/modules/organisation/organisation.model.js";
import { CSRF, createTestApp, createUser, signInAs } from "./helpers/app.js";

/** @type {Awaited<ReturnType<typeof createTestApp>>} */
let t;
/** @type {Record<string, ReturnType<typeof as>>} */
const u = {};
/** @type {any} */ let kandy;

/** @param {string} token */
const as = (token) => ({
  get: (/** @type {string} */ p) =>
    t.http().get(`/api/v1${p}`).set("Authorization", `Bearer ${token}`),
  /** Raw bytes of a download. @param {string} p */
  bytes: (/** @type {string} */ p) =>
    t
      .http()
      .get(`/api/v1${p}`)
      .set("Authorization", `Bearer ${token}`)
      .buffer(true)
      .parse((res, cb) => {
        /** @type {Buffer[]} */
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      }),
  post: (/** @type {string} */ p, /** @type {object} */ b = {}) =>
    t.http().post(`/api/v1${p}`).set(CSRF).set("Authorization", `Bearer ${token}`).send(b),
});

beforeAll(async () => {
  t = await createTestApp();
  const [div] = await Division.create([{ name: "Kandy", code: "KANDY" }]);
  [kandy] = await Station.create(
    /** @type {any[]} */ ([{ name: "Kandy Police Station", code: "KDY", divisionId: div?._id }]),
  );
  const accounts = {
    admin: await createUser({ role: "hq_admin" }),
    executive: await createUser({ role: "executive" }),
    oic: await createUser({ role: "station_oic", stationId: kandy._id }),
  };
  for (const [k, user] of Object.entries(accounts)) u[k] = as(await signInAs(t, user));
});
afterAll(() => t.close());
beforeEach(() => {
  signInLimiter.reset();
  clearDashboardCache();
});

describe("the files", () => {
  it("writes a well-formed PDF: offsets right, pages broken with the table header, text escaped", () => {
    const pdf = renderPdf({
      title: "Test (report)",
      subtitle: "All of Sri Lanka · 1 Oct 2026",
      sections: [
        { heading: "Figures", pairs: [["Reports received", "12"]] },
        {
          heading: "Rows",
          table: {
            head: ["Item", "Value"],
            rows: Array.from({ length: 120 }, (_, i) => [`Row ${i} — (a)`, String(i)]),
          },
        },
      ],
    });
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    // Every cross-reference offset points at its object.
    const xrefAt = Number(text.match(/startxref\n(\d+)/)?.[1]);
    const entries = text.slice(xrefAt).match(/^\d{10} 00000 n $/gm) ?? [];
    entries.forEach((line, i) => {
      expect(text.slice(Number(line.slice(0, 10))).startsWith(`${i + 1} 0 obj`)).toBe(true);
    });
    const pages = Number(text.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/)?.[1]);
    expect(pages).toBeGreaterThan(1);
    expect(text).toContain(`page ${pages} of ${pages}`);
    expect(text.match(/\(Item\) Tj/g)?.length).toBe(pages);
    expect(text).toContain("(Test \\(report\\)) Tj");
  });

  it("writes CSV that a spreadsheet won't run as formulas", () => {
    const csv = renderCsv({
      title: "T",
      subtitle: "S",
      sections: [{ heading: "H", table: { head: ["A", "B"], rows: [["=HYPERLINK(1)", "a,b"]] } }],
    }).toString("utf8");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(`'=HYPERLINK(1),"a,b"`);
  });
});

describe("on demand (§7)", () => {
  it("HQ makes a report; the run records each file's fingerprint and the download matches", async () => {
    const res = await u.admin?.post("/management-reports", {
      type: "daily_operations",
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-01",
    });
    expect(res?.status).toBe(201);
    expect(res?.body).toMatchObject({
      status: "done",
      title: "Daily operations summary",
      periodLabel: "Thursday, 1 October 2026",
      scope: { kind: "national", label: "All of Sri Lanka" },
      trigger: "on_demand",
    });
    const pdf = await u.admin?.bytes(`/management-reports/runs/${res?.body.id}/pdf`);
    expect(pdf?.headers["content-type"]).toBe("application/pdf");
    const bytes = /** @type {Buffer} */ (pdf?.body);
    expect(bytes.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(res?.body.files.pdf.sha256);

    const csv = await u.admin?.bytes(`/management-reports/runs/${res?.body.id}/csv`);
    expect(String(csv?.body)).toContain("Reports received");
    expect(
      await AuditEntry.exists({
        action: "management_reports.generated",
        "target.id": res?.body.id,
      }),
    ).toBeTruthy();
  });

  it("read-only roles download reports but don't make them", async () => {
    expect((await u.executive?.get("/management-reports"))?.body.canRequest).toBe(false);
    expect(
      (await u.executive?.post("/management-reports", { type: "overdue", period: "30d" }))?.status,
    ).toBe(403);
  });

  it("an OIC makes station reports for their own station and sees only those", async () => {
    const list = (await u.oic?.get("/management-reports"))?.body;
    expect(list.types.map((/** @type {any} */ x) => x.key).sort()).toEqual([
      "overdue",
      "weekly_stations",
    ]);
    expect(
      (await u.oic?.post("/management-reports", { type: "daily_operations", period: "7d" }))
        ?.status,
    ).toBe(400);
    const made = await u.oic?.post("/management-reports", {
      type: "weekly_stations",
      period: "7d",
    });
    expect(made?.body.scope).toEqual({ kind: "station", label: "Kandy Police Station" });
    const runs = (await u.oic?.get("/management-reports"))?.body.items;
    expect(runs.every((/** @type {any} */ r) => r.scope.kind === "station")).toBe(true);
    expect(runs).toHaveLength(1);
  });
});

describe("the schedule (§7)", () => {
  it("knows the last complete day, Monday-to-Sunday week and month in Sri Lanka time", () => {
    // Monday 2 November 2026, 06:30 in Colombo.
    const now = new Date("2026-11-02T01:00:00Z");
    expect(lastComplete("daily", now).from.toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(lastComplete("weekly", now).from.toISOString()).toBe("2026-10-25T18:30:00.000Z");
    expect(lastComplete("monthly", now).from.toISOString()).toBe("2026-09-30T18:30:00.000Z");
  });

  it("makes each scheduled report once, after 06:00", async () => {
    await ReportRun.deleteMany({ trigger: "scheduled" });
    expect(await runScheduledReports(new Date("2026-11-02T01:00:00Z"))).toBe(5);
    expect(await runScheduledReports(new Date("2026-11-02T02:00:00Z"))).toBe(0);
    // 05:30 the next day: yesterday's daily reports aren't due yet.
    expect(await runScheduledReports(new Date("2026-11-03T00:00:00Z"))).toBe(0);
    expect(await runScheduledReports(new Date("2026-11-03T00:45:00Z"))).toBe(2);
    const titles = (await ReportRun.find({ trigger: "scheduled" }).lean()).map(
      (r) => r.periodLabel,
    );
    expect(titles).toContain("October 2026");
    expect(titles).toContain("26 Oct 2026 – 1 Nov 2026");
  });
});

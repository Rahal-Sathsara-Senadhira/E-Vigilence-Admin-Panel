// Migration runner — docs/14 §5 (R1–R4).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Migration } from "../src/migrations/migration";
import { MigrationsService } from "../src/migrations/migrations.service";
import { MIGRATIONS } from "../src/migrations/registry";
import { AuditService } from "../src/modules/audit/audit.service";
import { createTestApp, type TestApp } from "./helpers";

let t: TestApp;
let service: MigrationsService;

beforeAll(async () => {
  t = await createTestApp();
  service = new MigrationsService(t.conn, t.app.get(AuditService));
});
afterAll(() => t.close());

const counter = (id: string, fail = false): Migration => ({
  id,
  description: `Test migration ${id}`,
  async run({ conn, apply }) {
    if (fail) throw new Error("boom");
    if (apply) await conn.collection("migration_probe").insertOne({ id });
    return { changed: 1 };
  },
});

describe("migrations", () => {
  it("a dry run writes nothing and records nothing", async () => {
    const runs = await service.run({ apply: false, migrations: [counter("t-1")] });
    expect(runs[0]!.status).toBe("would_apply");
    expect(await t.conn.collection("migration_probe").countDocuments()).toBe(0);
    expect(await t.conn.collection("migrations").countDocuments()).toBe(0);
  });

  it("applies once, records it, and skips it next time", async () => {
    const first = await service.run({ apply: true, migrations: [counter("t-2")] });
    expect(first[0]!.status).toBe("applied");
    const second = await service.run({ apply: true, migrations: [counter("t-2")] });
    expect(second[0]!.status).toBe("already_applied");
    expect(await t.conn.collection("migration_probe").countDocuments({ id: "t-2" })).toBe(1);

    const audit = await t.conn
      .collection("audit_log")
      .findOne({ action: "system.migration_applied" });
    expect(audit?.target?.id).toBe("t-2");
  });

  it("runs a repeatable migration every time", async () => {
    const repeat = { ...counter("t-repeat"), repeatable: true };
    await service.run({ apply: true, migrations: [repeat] });
    const again = await service.run({ apply: true, migrations: [repeat] });
    expect(again[0]!.status).toBe("applied");
    expect(await t.conn.collection("migration_probe").countDocuments({ id: "t-repeat" })).toBe(2);
    expect(await t.conn.collection("migrations").countDocuments({ _id: "t-repeat" as never })).toBe(
      1,
    );
  });

  it("stops at the first failure so later steps don't run", async () => {
    const runs = await service.run({
      apply: true,
      migrations: [counter("t-3", true), counter("t-4")],
    });
    expect(runs.map((r) => r.status)).toEqual(["failed"]);
    expect(await t.conn.collection("migrations").countDocuments({ _id: "t-4" as never })).toBe(0);
  });

  it("the index migration creates nothing extra on a database the API already indexed", async () => {
    const runs = await service.run({ apply: false, migrations: MIGRATIONS });
    expect(runs[0]!.id).toBe("0001-create-indexes");
    expect(runs[0]!.result?.changed).toBe(0);
  });
});

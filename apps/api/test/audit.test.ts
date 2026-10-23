// The append-only, hash-chained audit log — docs/10 §4.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuditService } from "../src/modules/audit/audit.service";
import { systemContext } from "../src/common/context";
import { bearer, createStaff, createStation, createTestApp, signIn, type TestApp } from "./helpers";

let t: TestApp;
let audit: AuditService;

beforeAll(async () => {
  t = await createTestApp();
  audit = t.app.get(AuditService);
});
afterAll(() => t.close());

describe("audit log", () => {
  it("records sign-ins and account changes with the actor", async () => {
    const station = await createStation(t);
    const hq = await createStaff(t, { role: "hq" });
    const { token } = await signIn(t, hq);
    await t.http().post("/api/v1/users").set(bearer(token)).send({
      name: "Kamala Silva",
      email: "kamala@police.test",
      nic: "198712345678",
      role: "station_officer",
      stationId: station,
    });

    const res = await t.http().get("/api/v1/audit").set(bearer(token));
    const actions = res.body.items.map((e: { action: string }) => e.action);
    expect(actions).toContain("auth.login");
    expect(actions).toContain("user.created");
    const created = res.body.items.find((e: { action: string }) => e.action === "user.created");
    expect(created.actor).toMatchObject({ kind: "user", userId: hq.id, role: "hq" });
    expect(created.target).toMatchObject({ type: "user", label: "kamala@police.test" });
  });

  it("keeps one unbroken chain under concurrent writes", async () => {
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        audit.record(systemContext("test"), { action: "system.test", summary: `Entry ${i}` }),
      ),
    );
    const status = await audit.verifyChain();
    expect(status.ok).toBe(true);
    const seqs = (
      await t.conn
        .collection("audit_log")
        .find({}, { projection: { seq: 1 } })
        .sort({ seq: 1 })
        .toArray()
    ).map((d) => d.seq);
    expect(seqs).toEqual(Array.from({ length: seqs.length }, (_, i) => i + 1));
  });

  it("detects an edited entry", async () => {
    await audit.record(systemContext("test"), { action: "system.test", summary: "Original text" });
    const victim = await t.conn.collection("audit_log").findOne({ summary: "Original text" });
    await t.conn
      .collection("audit_log")
      .updateOne({ _id: victim!._id }, { $set: { summary: "Edited text" } });

    const status = await audit.verifyChain();
    expect(status.ok).toBe(false);
    expect(status.brokenAtSeq).toBe(victim!.seq);

    await t.conn
      .collection("audit_log")
      .updateOne({ _id: victim!._id }, { $set: { summary: "Original text" } });
    expect((await audit.verifyChain()).ok).toBe(true);
  });

  it("detects a deleted entry", async () => {
    await audit.record(systemContext("test"), { action: "system.test", summary: "To be removed" });
    await audit.record(systemContext("test"), { action: "system.test", summary: "After it" });
    const victim = await t.conn.collection("audit_log").findOne({ summary: "To be removed" });
    await t.conn.collection("audit_log").deleteOne({ _id: victim!._id });
    const status = await audit.verifyChain();
    expect(status.ok).toBe(false);
    expect(status.brokenAtSeq).toBe(victim!.seq + 1);
    await t.conn.collection("audit_log").insertOne(victim!);
  });

  it("shows dev technical events only, and an OIC their own station only", async () => {
    await audit.record(
      { actor: { kind: "user", role: "hq" }, source: { ip: null, app: "web" } },
      { action: "person.viewed", summary: "Viewed a person record" },
    );
    const dev = await createStaff(t, { role: "dev" });
    const devRes = await t
      .http()
      .get("/api/v1/audit?pageSize=100")
      .set(bearer((await signIn(t, dev)).token));
    expect(devRes.body.items.some((e: { action: string }) => e.action === "person.viewed")).toBe(
      false,
    );

    const kandy = await createStation(t, "Kandy Audit");
    const oic = await createStaff(t, { role: "station_oic", stationId: kandy });
    const oicRes = await t
      .http()
      .get("/api/v1/audit?pageSize=100")
      .set(bearer((await signIn(t, oic)).token));
    expect(oicRes.status).toBe(200);
    expect(
      oicRes.body.items.every((e: { actor: { stationId: string } }) => e.actor.stationId === kandy),
    ).toBe(true);

    const verifyByOic = await t
      .http()
      .get("/api/v1/audit/verify")
      .set(bearer((await signIn(t, oic)).token));
    expect(verifyByOic.status).toBe(403);
  });
});

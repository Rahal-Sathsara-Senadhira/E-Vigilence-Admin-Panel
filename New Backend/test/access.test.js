// Roles and the permission matrix — docs/20 §3–6.

import express from "express";
import { describe, expect, it } from "vitest";
import { publicRoute, requirePermission, unguardedRoutes } from "#src/core/access/guards.js";
import { MATRIX, grantsFor } from "#src/core/access/permissions.js";
import { ROLES, canManageRole, roleInfo } from "#src/core/access/roles.js";

describe("roles", () => {
  it("has the 11 roles of docs/20", () => {
    expect(ROLES).toHaveLength(11);
  });

  it("requires two-step sign-in for national and division roles only", () => {
    for (const role of ROLES) {
      expect(roleInfo(role).mfaRequired).toBe(roleInfo(role).level !== "station");
    }
  });

  it("gives read-only roles nothing that changes data", () => {
    for (const role of ["auditor", "executive"]) {
      for (const scope of Object.values(grantsFor(/** @type {any} */ (role))))
        expect(scope).toBe("R");
    }
  });

  it("keeps the system administrator away from cases, people, evidence and money (S7)", () => {
    const grants = Object.keys(grantsFor("system_admin"));
    expect(
      grants.filter((p) => /^(reports|cases|persons|evidence|notices|payments|court)\./.test(p)),
    ).toEqual([]);
  });

  it("only lists real roles in the matrix", () => {
    for (const grants of Object.values(MATRIX)) {
      for (const role of Object.keys(grants)) expect(ROLES).toContain(role);
    }
  });

  it("follows 'who manages whom' (§6)", () => {
    expect(canManageRole("system_admin", "hq_admin")).toBe(true);
    expect(canManageRole("hq_admin", "hq_admin")).toBe(false);
    expect(canManageRole("hq_admin", "system_admin")).toBe(false);
    expect(canManageRole("hq_admin", "station_oic")).toBe(true);
    expect(canManageRole("station_oic", "traffic_officer")).toBe(true);
    expect(canManageRole("station_oic", "station_oic")).toBe(false);
    expect(canManageRole("traffic_officer", "station_clerk")).toBe(false);
  });
});

describe("guards", () => {
  /** Runs one guard against a fake request. @param {any} guard @param {any} req */
  const run = (guard, req) =>
    new Promise((resolve) => {
      guard(req, {}, (/** @type {any} */ err) => resolve(err ?? null));
    });

  it("lets a role through only with the permission, and sets the scope", async () => {
    const req = { method: "POST", auth: { role: "station_oic" } };
    expect(await run(requirePermission("cases.decide"), req)).toBeNull();
    expect(/** @type {any} */ (req).scope).toBe("S");
    const refused = /** @type {any} */ (
      await run(requirePermission("cases.override"), {
        method: "POST",
        auth: { role: "station_oic" },
      })
    );
    expect(refused.status).toBe(403);
  });

  it("lets read-only roles read but never change (S6)", async () => {
    expect(
      await run(requirePermission("cases.view"), { method: "GET", auth: { role: "auditor" } }),
    ).toBeNull();
    const write = /** @type {any} */ (
      await run(requirePermission("cases.view"), { method: "POST", auth: { role: "auditor" } })
    );
    expect(write.status).toBe(403);
  });

  it("asks unauthenticated callers to sign in", async () => {
    const err = /** @type {any} */ (await run(requirePermission("cases.view"), { method: "GET" }));
    expect(err.status).toBe(401);
  });

  it("finds routes that don't declare access", () => {
    const app = express();
    const router = express.Router();
    router.get("/ok", publicRoute(), (_req, res) => res.end());
    router.get("/forgotten", (_req, res) => res.end());
    app.use("/api", router);
    expect(unguardedRoutes(app)).toEqual(["GET /forgotten"]);
  });

  it("refuses unknown permission names when routes are defined", () => {
    expect(() => requirePermission(/** @type {any} */ ("cases.teleport"))).toThrow(
      /Unknown permission/,
    );
  });
});

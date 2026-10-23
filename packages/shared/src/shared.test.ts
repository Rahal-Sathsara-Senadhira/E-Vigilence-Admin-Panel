import { describe, expect, it } from "vitest";
import {
  InvalidTransitionError,
  PERMISSIONS,
  PERMISSION_MATRIX,
  STAFF_ROLES,
  canManageRole,
  caseMachine,
  changePasswordSchema,
  createUserSchema,
  normalizeNic,
  normalizePhone,
  normalizePlate,
  scopeOf,
} from "./index.js";

describe("roles (docs/01 §7)", () => {
  it("only dev can manage dev accounts — closes P3", () => {
    expect(canManageRole("dev", "dev")).toBe(true);
    expect(canManageRole("hq", "dev")).toBe(false);
    expect(canManageRole("station_oic", "dev")).toBe(false);
  });

  it("an OIC manages traffic officers only", () => {
    expect(canManageRole("station_oic", "station_officer")).toBe(true);
    expect(canManageRole("station_oic", "station_oic")).toBe(false);
    expect(canManageRole("station_oic", "hq")).toBe(false);
    expect(canManageRole("station_officer", "station_officer")).toBe(false);
  });

  it("the reserved division role can't be granted", () => {
    expect(canManageRole("dev", "division_admin")).toBe(false);
  });
});

describe("permission matrix (docs/01 §6)", () => {
  it("every grant names a known permission", () => {
    for (const grants of Object.values(PERMISSION_MATRIX)) {
      for (const key of Object.keys(grants)) expect(PERMISSIONS).toContain(key);
    }
  });

  it("dev has no case authority — closes P1/P3 (§4.5)", () => {
    const forbidden = [
      "reports.triage",
      "cases.dispatch",
      "cases.decide",
      "cases.override",
      "notices.withdraw",
      "payments.recordReceipt",
      "court.record",
      "rewards.approvePayouts",
      "persons.view",
    ] as const;
    for (const p of forbidden) expect(scopeOf("dev", p)).toBeNull();
  });

  it("officers can't decide; OICs decide for their station only — S1 (P2)", () => {
    expect(scopeOf("station_officer", "cases.decide")).toBeNull();
    expect(scopeOf("station_oic", "cases.decide")).toBe("station");
    expect(scopeOf("hq", "cases.decide")).toBe("all");
  });

  it("officers investigate only cases assigned to them", () => {
    expect(scopeOf("station_officer", "cases.investigate")).toBe("assigned");
    expect(scopeOf("station_officer", "persons.view")).toBe("assigned");
  });

  it("only HQ approves reward payouts and overrides decisions", () => {
    for (const role of STAFF_ROLES) {
      const expected = role === "hq";
      expect(scopeOf(role, "rewards.approvePayouts") !== null).toBe(expected);
      expect(scopeOf(role, "cases.override") !== null).toBe(expected);
    }
  });

  it("the reserved division role has no grants yet", () => {
    expect(Object.keys(PERMISSION_MATRIX.division_admin)).toHaveLength(0);
  });
});

describe("case state machine (docs/03 §4)", () => {
  it("follows the happy path", () => {
    const path = [
      "open",
      "dispatched",
      "accepted",
      "investigating",
      "recommended",
      "decided",
      "closed",
    ] as const;
    for (let i = 1; i < path.length; i++)
      expect(caseMachine.canMove(path[i - 1]!, path[i]!)).toBe(true);
  });

  it("allows return, send-back and reopen", () => {
    expect(caseMachine.canMove("dispatched", "returned")).toBe(true);
    expect(caseMachine.canMove("returned", "dispatched")).toBe(true);
    expect(caseMachine.canMove("recommended", "investigating")).toBe(true);
    expect(caseMachine.canMove("closed", "investigating")).toBe(true);
  });

  it("refuses every other move — C1", () => {
    expect(caseMachine.canMove("open", "decided")).toBe(false);
    expect(caseMachine.canMove("investigating", "decided")).toBe(false);
    expect(caseMachine.canMove("recommended", "closed")).toBe(false);
    expect(caseMachine.canMove("decided", "investigating")).toBe(false);
    expect(() => caseMachine.assertMove("open", "decided")).toThrow(InvalidTransitionError);
  });

  it("has no terminal state (closed can be reopened)", () => {
    expect(caseMachine.terminal).toEqual([]);
  });
});

describe("Sri Lankan identifiers", () => {
  it("normalises phone numbers", () => {
    expect(normalizePhone("077 123 4567")).toBe("+94771234567");
    expect(normalizePhone("0094771234567")).toBe("+94771234567");
    expect(normalizePhone("12345")).toBeNull();
  });

  it("validates both NIC formats", () => {
    expect(normalizeNic("852345678v")).toBe("852345678V");
    expect(normalizeNic("1985 2340 5678")).toBe("198523405678");
    expect(normalizeNic("12345678")).toBeNull();
    expect(normalizeNic("178523405678")).toBeNull();
  });

  it("normalises plates", () => {
    expect(normalizePlate("wp cab 1234")).toBe("WP CAB-1234");
    expect(normalizePlate("250-1234")).toBe("250-1234");
    expect(normalizePlate("XX1")).toBeNull();
  });
});

describe("schemas", () => {
  it("station roles need a station", () => {
    const base = {
      name: "A. Perera",
      email: "a@police.lk",
      nic: "852345678V",
      role: "station_officer",
    };
    expect(createUserSchema.safeParse(base).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, stationId: "a".repeat(24) }).success).toBe(true);
    expect(createUserSchema.safeParse({ ...base, role: "hq" }).success).toBe(true);
  });

  it("refuses short, common or unchanged passwords", () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "short" }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "password1234" }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "Same-Pass-2026!",
        newPassword: "Same-Pass-2026!",
      }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "Kandy-Lake-Walk-77" })
        .success,
    ).toBe(true);
  });
});

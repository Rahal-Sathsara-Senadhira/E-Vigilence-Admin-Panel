import { describe, expect, it } from "vitest";
import { STAFF_ROLES, TIME_LIMITS, scopeOf, toMilliseconds } from "./index.js";

describe("time limits (docs/09 §4)", () => {
  it("has unique keys and defaults inside their allowed range", () => {
    const keys = TIME_LIMITS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of TIME_LIMITS) {
      expect(t.default).toBeGreaterThanOrEqual(t.min);
      expect(t.default).toBeLessThanOrEqual(t.max);
    }
  });

  it("matches the agreed defaults", () => {
    const value = (key: string) => TIME_LIMITS.find((t) => t.key === key)?.default;
    expect(value("case.accept")).toBe(24);
    expect(value("case.acceptP1")).toBe(2);
    expect(value("notice.respond")).toBe(14);
    expect(value("escalation.multiplier")).toBe(2);
  });

  it("only HQ can change time limits — D09-8", () => {
    for (const role of STAFF_ROLES) {
      expect(scopeOf(role, "settings.timeLimits") !== null).toBe(role === "hq");
    }
  });

  it("converts calendar time", () => {
    expect(toMilliseconds("hours", 2)).toBe(7_200_000);
    expect(toMilliseconds("days", 1)).toBe(86_400_000);
    expect(() => toMilliseconds("count", 5)).toThrow();
  });
});

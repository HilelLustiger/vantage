import { describe, expect, it } from "vitest";
import { xirr } from "../../services/xirr.js";

describe("xirr", () => {
  it("returns ~20% for a simple one-year 1000 -> 1200 round trip", () => {
    const rate = xirr([
      { date: new Date("2025-01-01"), amount: -1000 },
      { date: new Date("2026-01-01"), amount: 1200 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(0.2, 2);
  });

  it("returns null with fewer than two cash flows", () => {
    expect(xirr([])).toBeNull();
    expect(xirr([{ date: new Date(), amount: -100 }])).toBeNull();
  });

  it("returns null when every flow has the same sign (no rate could reconcile them)", () => {
    const rate = xirr([
      { date: new Date("2025-01-01"), amount: -100 },
      { date: new Date("2025-06-01"), amount: -50 },
    ]);
    expect(rate).toBeNull();
  });

  it("handles multiple contributions before a single payout", () => {
    const rate = xirr([
      { date: new Date("2025-01-01"), amount: -1000 },
      { date: new Date("2025-07-01"), amount: -500 },
      { date: new Date("2026-01-01"), amount: 1650 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeGreaterThan(0);
  });
});

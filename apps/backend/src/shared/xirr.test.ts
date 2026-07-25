import { describe, expect, it } from "vitest";
import { computeXirr } from "./xirr.js";

describe("computeXirr", () => {
  it("solves a single-year round trip to exactly 10%", () => {
    const rate = computeXirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 1100 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(0.1, 3);
  });

  it("compounds correctly across two years (independent day-count check)", () => {
    const rate = computeXirr([
      { date: "2024-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 1210 }, // 1000 * 1.1^2
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(0.1, 2);
  });

  it("solves a loss to a negative rate", () => {
    const rate = computeXirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 900 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(-0.1, 3);
  });

  it("solves a multi-flow series with no closed form, verified by residual", () => {
    const flows = [
      { date: "2024-01-01", amount: -1000 },
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 2200 },
    ];
    const rate = computeXirr(flows);
    expect(rate).not.toBeNull();

    // The actual definition of a correct XIRR: net present value of the
    // series at the found rate is ~0 — not a hand-computed expected value.
    const earliestDate = flows[0].date;
    const npv = flows.reduce((sum, f) => {
      const years = (Date.parse(f.date) - Date.parse(earliestDate)) / (1000 * 60 * 60 * 24 * 365);
      return sum + f.amount * Math.pow(1 + rate!, -years);
    }, 0);
    expect(Math.abs(npv)).toBeLessThan(0.01);
  });

  it("returns null when every flow is the same sign (no real root)", () => {
    expect(
      computeXirr([
        { date: "2025-01-01", amount: -1000 },
        { date: "2025-06-01", amount: -500 },
      ]),
    ).toBeNull();
  });

  it("returns null for fewer than two flows", () => {
    expect(computeXirr([])).toBeNull();
    expect(computeXirr([{ date: "2025-01-01", amount: -1000 }])).toBeNull();
  });
});

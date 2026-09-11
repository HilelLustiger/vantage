import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { aggregateByCurrency, aggregateHoldings } from "../../domain/portfolioAggregation.js";

describe("aggregateHoldings", () => {
  it("sums quantity and rate-converted value across accounts for the same asset", () => {
    const assetId = randomUUID();

    const lines = aggregateHoldings(
      [
        { assetId, quantity: "10", value: "1000", currency: "ILS", rate: 1 },
        { assetId, quantity: "5", value: "500", currency: "ILS", rate: 1 },
      ],
      "ILS",
    );

    expect(lines).toEqual([{ assetId, quantity: "15", value: "1500", currency: "ILS" }]);
  });

  it("applies each holding's own exchange rate before summing", () => {
    const assetId = randomUUID();

    const lines = aggregateHoldings(
      [
        { assetId, quantity: "10", value: "100", currency: "ILS", rate: 1 }, // already ILS
        { assetId, quantity: "5", value: "100", currency: "USD", rate: 3.5 }, // USD -> ILS
      ],
      "ILS",
    );

    expect(lines).toEqual([{ assetId, quantity: "15", value: "450", currency: "ILS" }]);
  });

  it("keeps distinct assets as separate lines", () => {
    const assetA = randomUUID();
    const assetB = randomUUID();

    const lines = aggregateHoldings(
      [
        { assetId: assetA, quantity: "10", value: "1000", currency: "ILS", rate: 1 },
        { assetId: assetB, quantity: "2", value: "200", currency: "ILS", rate: 1 },
      ],
      "ILS",
    );

    expect(new Set(lines.map((l) => l.assetId))).toEqual(new Set([assetA, assetB]));
  });

  it("returns an empty list for no holdings", () => {
    expect(aggregateHoldings([], "ILS")).toEqual([]);
  });

  it("tags every line with the requested display currency", () => {
    const assetId = randomUUID();

    const lines = aggregateHoldings(
      [{ assetId, quantity: "1", value: "10", currency: "ILS", rate: 1 }],
      "USD",
    );

    expect(lines[0].currency).toBe("USD");
  });
});

describe("aggregateByCurrency", () => {
  it("groups by original currency, keeping the raw (unconverted) sum per bucket", () => {
    const assetId = randomUUID();

    const lines = aggregateByCurrency([
      { assetId, quantity: "10", value: "100", currency: "ILS", rate: 1 },
      { assetId, quantity: "5", value: "50", currency: "USD", rate: 3.5 },
    ]);

    const ils = lines.find((l) => l.currency === "ILS")!;
    const usd = lines.find((l) => l.currency === "USD")!;
    expect(ils.value).toBe("100");
    expect(usd.value).toBe("50");
  });

  it("computes percentageOfPortfolio from converted totals, summing to ~100 across buckets", () => {
    const assetId = randomUUID();

    // 100 ILS (rate 1) + 50 USD @ 3.5 = 175 ILS -> 100/275 and 175/275
    const lines = aggregateByCurrency([
      { assetId, quantity: "10", value: "100", currency: "ILS", rate: 1 },
      { assetId, quantity: "5", value: "50", currency: "USD", rate: 3.5 },
    ]);

    const total = lines.reduce((sum, l) => sum + l.percentageOfPortfolio, 0);
    expect(total).toBeCloseTo(100, 5);

    const ils = lines.find((l) => l.currency === "ILS")!;
    expect(ils.percentageOfPortfolio).toBeCloseTo((100 / 275) * 100, 5);
  });

  it("returns an empty list for no holdings", () => {
    expect(aggregateByCurrency([])).toEqual([]);
  });
});

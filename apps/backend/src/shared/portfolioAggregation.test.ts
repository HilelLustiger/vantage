import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { aggregateHoldings } from "./portfolioAggregation.js";

describe("aggregateHoldings", () => {
  it("sums quantity and rate-converted value across accounts for the same asset", () => {
    const assetId = randomUUID();

    const lines = aggregateHoldings(
      [
        { assetId, quantity: "10", value: "1000", rate: 1 },
        { assetId, quantity: "5", value: "500", rate: 1 },
      ],
      "ILS",
    );

    expect(lines).toEqual([{ assetId, quantity: "15", value: "1500", currency: "ILS" }]);
  });

  it("applies each holding's own exchange rate before summing", () => {
    const assetId = randomUUID();

    const lines = aggregateHoldings(
      [
        { assetId, quantity: "10", value: "100", rate: 1 }, // already ILS
        { assetId, quantity: "5", value: "100", rate: 3.5 }, // USD -> ILS
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
        { assetId: assetA, quantity: "10", value: "1000", rate: 1 },
        { assetId: assetB, quantity: "2", value: "200", rate: 1 },
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

    const lines = aggregateHoldings([{ assetId, quantity: "1", value: "10", rate: 1 }], "USD");

    expect(lines[0].currency).toBe("USD");
  });
});

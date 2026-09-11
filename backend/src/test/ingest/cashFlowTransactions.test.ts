import { describe, expect, it } from "vitest";
import { deriveFlowAmount, selectFlowTransactions } from "../../ingest/cashFlowTransactions.js";

describe("selectFlowTransactions", () => {
  it("keeps buy, deposit, sell, and withdrawal", () => {
    const transactions = [
      { kind: "buy" },
      { kind: "deposit" },
      { kind: "sell" },
      { kind: "withdrawal" },
    ];
    expect(selectFlowTransactions(transactions)).toEqual(transactions);
  });

  it("drops dividend, interest, other, and unrecognized kinds", () => {
    const transactions = [
      { kind: "dividend" },
      { kind: "interest" },
      { kind: "other" },
      { kind: "something-unrecognized" },
    ];
    expect(selectFlowTransactions(transactions)).toEqual([]);
  });

  it("preserves order and drops only the excluded rows from a mixed batch", () => {
    const buy = { kind: "buy", assetName: "A" };
    const dividend = { kind: "dividend", assetName: "B" };
    const sell = { kind: "sell", assetName: "C" };
    expect(selectFlowTransactions([buy, dividend, sell])).toEqual([buy, sell]);
  });
});

describe("deriveFlowAmount", () => {
  it.each([
    ["buy", "250.64", "250.64"],
    ["deposit", "100", "100"],
    ["sell", "100.37", "-100.37"],
    ["withdrawal", "50", "-50"],
  ])("kind %s with raw amount %s -> %s", (kind, amount, expected) => {
    expect(deriveFlowAmount(kind, amount)).toBe(expected);
  });

  // Excellence's amount is signed from the cash account's own perspective
  // (a buy is a cash decrease) — the inverse of the per-Asset convention
  // wanted here. Sign must come from `kind`, not from the input's own sign.
  it("re-derives sign from kind regardless of the input amount's own sign", () => {
    expect(deriveFlowAmount("buy", "-250.64")).toBe("250.64");
    expect(deriveFlowAmount("sell", "100.37")).toBe("-100.37");
  });
});

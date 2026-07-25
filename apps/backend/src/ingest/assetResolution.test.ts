import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAsset } from "../shared/db/assets.js";
import { resolveAssets } from "./assetResolution.js";

describe("resolveAssets", () => {
  it("matches a holding with a ticker that resolves to exactly one asset", async () => {
    const ticker = `TICK-${randomUUID()}`;
    const asset = await createAsset({ type: "stock", name: "Example Corp", ticker });

    const result = await resolveAssets({
      holdings: [{ assetName: "Example Corp", quantity: "10", value: "1000", currency: "ILS", ticker }],
    });

    expect(result).toEqual({ resolvedAssetIds: [asset.id], hasUnmatched: false });
  });

  it("matches a holding by isin when ticker is absent", async () => {
    const isin = `IL-${randomUUID()}`;
    const asset = await createAsset({ type: "bond", name: "Example Bond", isin });

    const result = await resolveAssets({
      holdings: [{ assetName: "Example Bond", quantity: "1", value: "500", currency: "ILS", isin }],
    });

    expect(result).toEqual({ resolvedAssetIds: [asset.id], hasUnmatched: false });
  });

  it("treats a duplicate-ticker registry state as unmatched", async () => {
    const ticker = `TICK-${randomUUID()}`;
    await createAsset({ type: "stock", name: "Example Corp", ticker });
    await createAsset({ type: "stock", name: "Example Corp Duplicate", ticker });

    const result = await resolveAssets({
      holdings: [{ assetName: "Example Corp", quantity: "10", value: "1000", currency: "ILS", ticker }],
    });

    expect(result).toEqual({ resolvedAssetIds: [null], hasUnmatched: true });
  });

  // Real shape captured from apps/parser/gemel.py against a real Meitav
  // statement — a pooled-fund balance, no ticker/isin at all. See #20.
  it("treats a Gemel-shaped holding (no ticker/isin) as unmatched", async () => {
    const result = await resolveAssets({
      institution: "מיטב גמל ופנסיה",
      holdings: [
        {
          assetName: "מיטב גמל להשקעה עוקב מדדי מניות",
          quantity: "1",
          value: "114883",
          currency: "ILS",
          annualReturnPct: "5.65%-",
        },
      ],
      checks: { reconciles: true },
    });

    expect(result).toEqual({ resolvedAssetIds: [null], hasUnmatched: true });
  });

  // Real shape from apps/parser/excellence.py. securityNumber matching was
  // added in #35 — no matching Asset is registered here, so this stays
  // unmatched (not because securityNumber goes unused, but because nothing
  // in the registry has it yet).
  it("treats an Excellence-shaped holding as unmatched when no asset shares its securityNumber", async () => {
    const result = await resolveAssets({
      institution: "אקסלנס",
      holdings: [
        {
          assetName: "אינ.חוץ500",
          securityNumber: "1183441",
          quantity: "2800.00",
          currentPriceIls: 42.53,
          value: "119084.00",
          currency: "ILS",
          percentOfPortfolio: "57.52",
        },
      ],
    });

    expect(result).toEqual({ resolvedAssetIds: [null], hasUnmatched: true });
  });

  // #35 — the securityNumber matching key this Excellence-shaped holding
  // needed to auto-match at all.
  it("matches an Excellence-shaped holding by securityNumber", async () => {
    const securityNumber = `SEC-${randomUUID()}`;
    const asset = await createAsset({ type: "etf", name: "S&P 500", securityNumber });

    const result = await resolveAssets({
      institution: "אקסלנס",
      holdings: [
        {
          assetName: "אינ.חוץ500",
          securityNumber,
          quantity: "2800.00",
          currentPriceIls: 42.53,
          value: "119084.00",
          currency: "ILS",
          percentOfPortfolio: "57.52",
        },
      ],
    });

    expect(result).toEqual({ resolvedAssetIds: [asset.id], hasUnmatched: false });
  });

  it("treats a duplicate-securityNumber registry state as unmatched", async () => {
    const securityNumber = `SEC-${randomUUID()}`;
    await createAsset({ type: "etf", name: "S&P 500", securityNumber });
    await createAsset({ type: "etf", name: "S&P 500 Duplicate", securityNumber });

    const result = await resolveAssets({
      holdings: [
        { assetName: "S&P 500", quantity: "1", value: "100", currency: "ILS", securityNumber },
      ],
    });

    expect(result).toEqual({ resolvedAssetIds: [null], hasUnmatched: true });
  });

  it("has no unmatched holdings when there are none to resolve", async () => {
    await expect(resolveAssets({ holdings: [] })).resolves.toEqual({
      resolvedAssetIds: [],
      hasUnmatched: false,
    });
  });

  it("returns null when the data doesn't have a holdings array at all", async () => {
    await expect(resolveAssets({ institution: "Bank Hapoalim" })).resolves.toBeNull();
  });

  it("returns null for completely unrelated data", async () => {
    await expect(resolveAssets("not an object")).resolves.toBeNull();
  });

  // Real shape from apps/parser/hapoalim_transactions.py (#37) — a
  // transactions-only, holdings-free Document. Flow-kind transactions
  // resolve through the same securityNumber path as a holding.
  it("matches a flow-kind transaction by securityNumber, holdings-free", async () => {
    const securityNumber = `SEC-${randomUUID()}`;
    const asset = await createAsset({ type: "mutual_fund", name: "Money Market", securityNumber });

    const result = await resolveAssets({
      institution: "Bank Hapoalim",
      transactions: [
        {
          date: "18/08/2025",
          securityNumber,
          assetName: "קרן כספית",
          kind: "buy",
          amount: "250.64",
          currency: "ILS",
        },
      ],
    });

    expect(result).toEqual({ resolvedAssetIds: [asset.id], hasUnmatched: false });
  });

  it("does not force review for a dividend transaction alongside an unmatched holding", async () => {
    const result = await resolveAssets({
      holdings: [{ assetName: "Unrecognized Fund", quantity: "1", value: "1000", currency: "ILS" }],
      transactions: [
        {
          date: "02/06/2026",
          securityNumber: "662577",
          assetName: "בנק הפועלים דיבידנד",
          kind: "dividend",
          amount: "1.95",
          currency: "ILS",
        },
      ],
    });

    // Only the holding is resolved (unmatched) — the dividend row never
    // reaches matchHolding at all, since it's filtered out before
    // resolution (it won't become a cash_flows row either way).
    expect(result).toEqual({ resolvedAssetIds: [null], hasUnmatched: true });
  });

  it("resolves holdings and flow transactions together as one combined, positionally-aligned list", async () => {
    const ticker = `TICK-${randomUUID()}`;
    const holdingAsset = await createAsset({ type: "stock", name: "Example Corp", ticker });
    const flowSecurityNumber = `SEC-${randomUUID()}`;
    const flowAsset = await createAsset({
      type: "etf",
      name: "S&P 500",
      securityNumber: flowSecurityNumber,
    });

    const result = await resolveAssets({
      holdings: [
        { assetName: "Example Corp", quantity: "10", value: "1000", currency: "ILS", ticker },
      ],
      transactions: [
        {
          date: "18/08/2025",
          securityNumber: flowSecurityNumber,
          assetName: "S&P 500",
          kind: "sell",
          amount: "100.37",
          currency: "ILS",
        },
      ],
    });

    expect(result).toEqual({
      resolvedAssetIds: [holdingAsset.id, flowAsset.id],
      hasUnmatched: false,
    });
  });
});

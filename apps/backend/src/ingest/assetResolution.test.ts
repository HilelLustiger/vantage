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

  // Real shape from apps/parser/excellence.py — a securityNumber is present
  // (a real, reliable identifier) but it's not a ticker or a verified ISIN,
  // so it's deliberately not used for matching yet (see #20's rationale).
  it("treats an Excellence-shaped holding (securityNumber only) as unmatched", async () => {
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
});

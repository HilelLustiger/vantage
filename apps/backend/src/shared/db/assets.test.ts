import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAsset, findAssetsByIsin, findAssetsByTicker } from "./assets.js";

describe("findAssetsByTicker", () => {
  it("finds a matching asset", async () => {
    const ticker = `TICK-${randomUUID()}`;
    const asset = await createAsset({ type: "stock", name: "Example Corp", ticker });

    const matches = await findAssetsByTicker(ticker);

    expect(matches.map((a) => a.id)).toEqual([asset.id]);
  });

  it("returns every match when more than one asset shares a ticker", async () => {
    const ticker = `TICK-${randomUUID()}`;
    const first = await createAsset({ type: "stock", name: "Example Corp", ticker });
    const second = await createAsset({ type: "stock", name: "Example Corp Duplicate", ticker });

    const matches = await findAssetsByTicker(ticker);

    expect(new Set(matches.map((a) => a.id))).toEqual(new Set([first.id, second.id]));
  });

  it("returns an empty array when nothing matches", async () => {
    await expect(findAssetsByTicker(`no-such-ticker-${randomUUID()}`)).resolves.toEqual([]);
  });
});

describe("findAssetsByIsin", () => {
  it("finds a matching asset", async () => {
    const isin = `IL-${randomUUID()}`;
    const asset = await createAsset({ type: "bond", name: "Example Bond", isin });

    const matches = await findAssetsByIsin(isin);

    expect(matches.map((a) => a.id)).toEqual([asset.id]);
  });

  it("returns an empty array when nothing matches", async () => {
    await expect(findAssetsByIsin(`no-such-isin-${randomUUID()}`)).resolves.toEqual([]);
  });
});

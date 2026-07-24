import { eq } from "drizzle-orm";
import type { Asset, AssetType } from "@vantage/shared-types";
import { db } from "./client.js";
import { assets } from "./schema.js";

// Postgres represents an absent ticker/isin/securityNumber as NULL; Asset
// models it as undefined (optional field) — normalize at the boundary so
// the DB's representation doesn't leak into the domain type.
function toAsset(row: typeof assets.$inferSelect): Asset {
  return {
    ...row,
    ticker: row.ticker ?? undefined,
    isin: row.isin ?? undefined,
    securityNumber: row.securityNumber ?? undefined,
  };
}

export async function createAsset(input: {
  type: AssetType;
  name: string;
  ticker?: string;
  isin?: string;
  securityNumber?: string;
}) {
  const [asset] = await db.insert(assets).values(input).returning();
  return toAsset(asset);
}

export async function findAssetById(id: string) {
  const [asset] = await db.select().from(assets).where(eq(assets.id, id));
  return asset && toAsset(asset);
}

export async function listAssets() {
  return (await db.select().from(assets)).map(toAsset);
}

// Returns all matches, not just one — ticker/isin have no unique constraint
// (ADR-0008: duplicate Assets are possible). The caller decides what to do
// with more than one match; this just reports what's in the registry.
export async function findAssetsByTicker(ticker: string) {
  return (await db.select().from(assets).where(eq(assets.ticker, ticker))).map(toAsset);
}

export async function findAssetsByIsin(isin: string) {
  return (await db.select().from(assets).where(eq(assets.isin, isin))).map(toAsset);
}

export async function findAssetsBySecurityNumber(securityNumber: string) {
  return (
    await db.select().from(assets).where(eq(assets.securityNumber, securityNumber))
  ).map(toAsset);
}

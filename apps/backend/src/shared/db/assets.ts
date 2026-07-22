import { eq } from "drizzle-orm";
import type { Asset, AssetType } from "@vantage/shared-types";
import { db } from "./client.js";
import { assets } from "./schema.js";

// Postgres represents an absent ticker/isin as NULL; Asset models it as
// undefined (optional field) — normalize at the boundary so the DB's
// representation doesn't leak into the domain type.
function toAsset(row: typeof assets.$inferSelect): Asset {
  return {
    ...row,
    ticker: row.ticker ?? undefined,
    isin: row.isin ?? undefined,
  };
}

export async function createAsset(input: {
  type: AssetType;
  name: string;
  ticker?: string;
  isin?: string;
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

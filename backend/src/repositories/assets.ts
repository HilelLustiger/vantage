import { eq } from "drizzle-orm";
import type { Asset, AssetType, NewAssetInput } from "../dto/index.js";
import { db, type DbExecutor } from "../db/client.js";
import { assets, type AssetRow } from "../db/schema.js";

function toAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    type: row.type as AssetType,
    name: row.name,
    ticker: row.ticker ?? undefined,
    isin: row.isin ?? undefined,
    securityNumber: row.securityNumber ?? undefined,
  };
}

export async function listAssets(): Promise<Asset[]> {
  const rows = await db.select().from(assets);
  return rows.map(toAsset);
}

export async function findAssetById(id: string): Promise<Asset | undefined> {
  const [row] = await db.select().from(assets).where(eq(assets.id, id));
  return row ? toAsset(row) : undefined;
}

export async function createAsset(input: NewAssetInput, executor: DbExecutor = db): Promise<Asset> {
  const [row] = await executor.insert(assets).values(input).returning();
  return toAsset(row);
}

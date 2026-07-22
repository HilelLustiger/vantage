// Auto-matches parsed holding lines to existing Assets by ticker/ISIN
// (ADR-0010) — never auto-creates, never guesses. As of today none of the
// real parser extractors (apps/parser/{gemel,hapoalim,excellence}.py) emit
// a ticker or isin, so every real Document will land in needs_review; that's
// correct, not a bug — see #20 for the full rationale.
import { z } from "zod";
import { findAssetsByIsin, findAssetsByTicker } from "../shared/db/assets.js";

// The one thing every extractor's output shares. .passthrough() lets
// institution-specific extras (checks, accountHolderName, securityNumber,
// annualReturnPct, ...) through without failing validation — they're just
// not used for matching.
const holdingSchema = z
  .object({
    assetName: z.string(),
    quantity: z.string(),
    value: z.string(),
    currency: z.string(),
    ticker: z.string().optional(),
    isin: z.string().optional(),
  })
  .passthrough();

const parsedDataSchema = z
  .object({
    holdings: z.array(holdingSchema),
  })
  .passthrough();

export interface AssetResolution {
  // Positionally aligned with parsedData.holdings.
  resolvedAssetIds: (string | null)[];
  hasUnmatched: boolean;
}

// Returns null if parsedData doesn't even validate — a real integration
// failure (recognized institution, unexpected shape), distinct from "valid
// shape, nothing matched".
export async function resolveAssets(parsedData: unknown): Promise<AssetResolution | null> {
  const parsed = parsedDataSchema.safeParse(parsedData);
  if (!parsed.success) {
    return null;
  }

  const resolvedAssetIds: (string | null)[] = [];
  for (const holding of parsed.data.holdings) {
    resolvedAssetIds.push(await matchHolding(holding));
  }

  return { resolvedAssetIds, hasUnmatched: resolvedAssetIds.includes(null) };
}

async function matchHolding(holding: { ticker?: string; isin?: string }): Promise<string | null> {
  // A match is only confident when it's exactly one — zero or more than one
  // (ticker/isin have no unique constraint, ADR-0008) is unmatched too.
  if (holding.ticker) {
    const matches = await findAssetsByTicker(holding.ticker);
    if (matches.length === 1) return matches[0].id;
  }
  if (holding.isin) {
    const matches = await findAssetsByIsin(holding.isin);
    if (matches.length === 1) return matches[0].id;
  }
  return null;
}

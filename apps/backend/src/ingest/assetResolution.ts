// Auto-matches parsed holding lines to existing Assets by ticker/ISIN/
// securityNumber (ADR-0010, ADR-0024) — never auto-creates, never guesses.
// As of today none of the real parser extractors emit a ticker or isin, so
// matching for real Documents relies on securityNumber (Excellence) or
// lands in needs_review otherwise; see #20 for the original rationale and
// #35 for the securityNumber extension.
import { z } from "zod";
import {
  findAssetsByIsin,
  findAssetsBySecurityNumber,
  findAssetsByTicker,
} from "../shared/db/assets.js";

// The one thing every extractor's output shares. .passthrough() lets
// institution-specific extras (checks, accountHolderName, annualReturnPct,
// ...) through without failing validation — they're just not used for
// matching (except securityNumber, which now is).
const holdingSchema = z
  .object({
    assetName: z.string(),
    quantity: z.string(),
    value: z.string(),
    currency: z.string(),
    ticker: z.string().optional(),
    isin: z.string().optional(),
    securityNumber: z.string().optional(),
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

async function matchHolding(holding: {
  ticker?: string;
  isin?: string;
  securityNumber?: string;
}): Promise<string | null> {
  // A match is only confident when it's exactly one — zero or more than one
  // (ticker/isin/securityNumber have no unique constraint, ADR-0008) is
  // unmatched too, never a guess.
  if (holding.ticker) {
    const matches = await findAssetsByTicker(holding.ticker);
    if (matches.length === 1) return matches[0].id;
  }
  if (holding.isin) {
    const matches = await findAssetsByIsin(holding.isin);
    if (matches.length === 1) return matches[0].id;
  }
  if (holding.securityNumber) {
    const matches = await findAssetsBySecurityNumber(holding.securityNumber);
    if (matches.length === 1) return matches[0].id;
  }
  return null;
}

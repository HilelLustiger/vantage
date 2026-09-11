// Auto-matches parsed holding lines to existing Assets by ticker/ISIN/
// securityNumber (ADR-0010, ADR-0024) — never auto-creates, never guesses.
// As of today none of the real parser extractors emit a ticker or isin, so
// matching for real Documents relies on securityNumber (Excellence) or
// lands in needs_review otherwise; see #20 for the original rationale and
// #35 for the securityNumber extension.
import { z } from "zod";
import { findAssetsByIsin, findAssetsBySecurityNumber, findAssetsByTicker } from "../db/assets.js";
import { selectFlowTransactions } from "./cashFlowTransactions.js";

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
    ticker: z.string().nullish(),
    isin: z.string().nullish(),
    securityNumber: z.string().nullish(),
  })
  .passthrough();

// Per-transaction rows (ADR-0024, #36/#37) — resolved the same way as
// holdings. Only the flow-kind subset (see cashFlowTransactions.ts)
// actually needs a resolved Asset; the rest are filtered out before ever
// reaching matchHolding, so a dividend/interest/other row never forces a
// needs_review batch for data that won't be persisted anyway.
// securityNumber/ticker/isin are `.nullish()`, not just `.optional()` —
// real data (Excellence's own pseudo-code rows, e.g. a cash deposit) emits
// an explicit JSON `null` for an unmatched candidate, not an absent key
// (Python's `None`), and zod's `.optional()` alone rejects `null`.
const transactionSchema = z
  .object({
    assetName: z.string(),
    kind: z.string(),
    amount: z.string(),
    ticker: z.string().nullish(),
    isin: z.string().nullish(),
    securityNumber: z.string().nullish(),
  })
  .passthrough();

const parsedDataSchema = z
  .object({
    holdings: z.array(holdingSchema).optional(),
    transactions: z.array(transactionSchema).optional(),
  })
  .passthrough();

export interface AssetResolution {
  // Positionally aligned with [...holdings, ...flow-kind transactions].
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
  if (parsed.data.holdings === undefined && parsed.data.transactions === undefined) {
    // Neither key present at all isn't a recognized shape this pipeline
    // can commit anything from.
    return null;
  }

  const lines = [
    ...(parsed.data.holdings ?? []),
    ...selectFlowTransactions(parsed.data.transactions ?? []),
  ];

  const resolvedAssetIds: (string | null)[] = [];
  for (const line of lines) {
    resolvedAssetIds.push(await matchHolding(line));
  }

  return { resolvedAssetIds, hasUnmatched: resolvedAssetIds.includes(null) };
}

async function matchHolding(holding: {
  ticker?: string | null;
  isin?: string | null;
  securityNumber?: string | null;
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

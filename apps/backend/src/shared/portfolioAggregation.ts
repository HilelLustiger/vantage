import type { PortfolioLine } from "@vantage/shared-types";

export interface ConvertedHolding {
  assetId: string;
  quantity: string;
  value: string;
  // Already-converted value's rate relative to the original holding
  // value — applied here, not stored (ADR-0012: convert at read time).
  rate: number;
}

// Groups holdings by Asset, summing quantity and (rate-converted) value —
// the cross-account exposure to one Asset that's the Portfolio's whole
// point (docs/DOMAIN.md).
export function aggregateHoldings(
  holdings: ConvertedHolding[],
  currency: string,
): PortfolioLine[] {
  const byAsset = new Map<string, { quantity: number; value: number }>();
  for (const holding of holdings) {
    const existing = byAsset.get(holding.assetId) ?? { quantity: 0, value: 0 };
    existing.quantity += Number(holding.quantity);
    existing.value += Number(holding.value) * holding.rate;
    byAsset.set(holding.assetId, existing);
  }
  return [...byAsset.entries()].map(([assetId, totals]) => ({
    assetId,
    quantity: String(totals.quantity),
    value: String(totals.value),
    currency,
  }));
}

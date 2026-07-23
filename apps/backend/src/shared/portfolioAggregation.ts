import type { CurrencyBreakdownLine, PortfolioLine } from "@vantage/shared-types";

export interface ConvertedHolding {
  assetId: string;
  quantity: string;
  value: string;
  // The Holding's original currency — unused by aggregateHoldings (grouped
  // by Asset instead), but needed by aggregateByCurrency below.
  currency: string;
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

// Groups holdings by their ORIGINAL currency (ADR-0022) — `value` per
// bucket stays raw/unconverted, since the point is showing what's actually
// held in each currency. `percentageOfPortfolio` still needs the converted
// totals as a comparable denominator across buckets.
export function aggregateByCurrency(holdings: ConvertedHolding[]): CurrencyBreakdownLine[] {
  const byCurrency = new Map<string, { raw: number; converted: number }>();
  let totalConverted = 0;
  for (const holding of holdings) {
    const convertedValue = Number(holding.value) * holding.rate;
    totalConverted += convertedValue;
    const existing = byCurrency.get(holding.currency) ?? { raw: 0, converted: 0 };
    existing.raw += Number(holding.value);
    existing.converted += convertedValue;
    byCurrency.set(holding.currency, existing);
  }
  return [...byCurrency.entries()]
    .map(([currency, totals]) => ({
      currency,
      value: String(totals.raw),
      percentageOfPortfolio: totalConverted === 0 ? 0 : (totals.converted / totalConverted) * 100,
    }))
    .sort((a, b) => b.percentageOfPortfolio - a.percentageOfPortfolio);
}

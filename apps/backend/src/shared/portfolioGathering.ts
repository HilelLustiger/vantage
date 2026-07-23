import { getExchangeRate } from "./exchangeRates.js";
import { listHoldingsForSnapshot } from "./db/holdings.js";
import { findLatestActiveSnapshotsForUser } from "./db/snapshots.js";
import type { ConvertedHolding } from "./portfolioAggregation.js";

// Shared by GET /api/portfolio and GET /api/portfolio/currency-breakdown —
// both need the same latest-active-Snapshots -> Holdings -> FX-converted
// walk, just grouped differently afterward.
export async function gatherLatestConvertedHoldings(
  userId: string,
  displayCurrency: string,
): Promise<ConvertedHolding[]> {
  const snapshots = await findLatestActiveSnapshotsForUser(userId);

  const converted: ConvertedHolding[] = [];
  for (const snapshot of snapshots) {
    const holdings = await listHoldingsForSnapshot(snapshot.id);
    for (const holding of holdings) {
      const rate = await getExchangeRate(snapshot.asOfDate, holding.currency, displayCurrency);
      converted.push({
        assetId: holding.assetId,
        quantity: holding.quantity,
        value: holding.value,
        currency: holding.currency,
        rate,
      });
    }
  }
  return converted;
}

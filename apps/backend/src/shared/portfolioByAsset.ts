import type { AssetHoldingBreakdown, Holding } from "@vantage/shared-types";
import { listHoldingsForSnapshot } from "./db/holdings.js";
import { findLatestActiveSnapshotsForUser } from "./db/snapshots.js";

// The "latest active Snapshot per Account -> its Holdings" walk, shared by
// every current-holdings view (this file's own aggregation below, and
// #40's cost-basis computation, which additionally needs each Holding's
// purchaseCostIls) — same gather-once/compute-many split as
// portfolioGathering.ts's FX-conversion path.
export async function gatherLatestHoldingsForUser(userId: string): Promise<Holding[]> {
  const snapshots = await findLatestActiveSnapshotsForUser(userId);

  const holdings: Holding[] = [];
  for (const snapshot of snapshots) {
    holdings.push(...(await listHoldingsForSnapshot(snapshot.id)));
  }
  return holdings;
}

// Entity-level, native-currency holdings view — see ADR-0022. No display
// currency, no FX lookups, no conversion (and so no 502-on-FX-failure
// path either) — deliberately the "show what's actually held" counterpart
// to /api/portfolio's converted aggregate.
export async function computePortfolioByAsset(userId: string): Promise<AssetHoldingBreakdown[]> {
  const holdings = await gatherLatestHoldingsForUser(userId);

  const byAsset = new Map<string, { quantity: number; valuesByCurrency: Map<string, number> }>();
  for (const holding of holdings) {
    const existing = byAsset.get(holding.assetId) ?? {
      quantity: 0,
      valuesByCurrency: new Map<string, number>(),
    };
    existing.quantity += Number(holding.quantity);
    existing.valuesByCurrency.set(
      holding.currency,
      (existing.valuesByCurrency.get(holding.currency) ?? 0) + Number(holding.value),
    );
    byAsset.set(holding.assetId, existing);
  }

  return [...byAsset.entries()].map(([assetId, totals]) => ({
    assetId,
    quantity: String(totals.quantity),
    valuesByCurrency: [...totals.valuesByCurrency.entries()].map(([currency, value]) => ({
      currency,
      value: String(value),
    })),
  }));
}

import type { AssetHoldingBreakdown } from "@vantage/shared-types";
import { listHoldingsForSnapshot } from "./db/holdings.js";
import { findLatestActiveSnapshotsForUser } from "./db/snapshots.js";

// Entity-level, native-currency holdings view — see ADR-0022. No display
// currency, no FX lookups, no conversion (and so no 502-on-FX-failure
// path either) — deliberately the "show what's actually held" counterpart
// to /api/portfolio's converted aggregate.
export async function computePortfolioByAsset(userId: string): Promise<AssetHoldingBreakdown[]> {
  const snapshots = await findLatestActiveSnapshotsForUser(userId);

  const byAsset = new Map<string, { quantity: number; valuesByCurrency: Map<string, number> }>();
  for (const snapshot of snapshots) {
    for (const holding of await listHoldingsForSnapshot(snapshot.id)) {
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

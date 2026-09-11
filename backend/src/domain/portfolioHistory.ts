import type { PortfolioHistoryPoint, Snapshot } from "../dto/index.js";
import { getExchangeRate } from "../infra/exchangeRates.js";
import { listHoldingsForSnapshot } from "../db/holdings.js";
import { listSnapshotsForUser } from "../db/snapshots.js";

// Net worth over time — see ADR-0022 (the aggregate, single-reference-
// currency side of that decision). One point per distinct Snapshot
// asOfDate across every Account (ADR-0009's supersede model means a full
// history, not just the latest active Snapshot, is needed here). Each
// point carries forward every Account's latest Snapshot as-of that date,
// converted using THAT POINT'S OWN DATE's exchange rate — not the
// carried-forward Snapshot's own asOfDate — so a point reflects "what was
// this holdings mix worth at this point in the timeline," matching
// ADR-0012's read-time-conversion philosophy applied per point.
export async function computePortfolioHistory(
  userId: string,
  displayCurrency: string,
): Promise<PortfolioHistoryPoint[]> {
  const allSnapshots = await listSnapshotsForUser(userId, { includeSuperseded: true });
  if (allSnapshots.length === 0) return [];

  const byAccount = new Map<string, Snapshot[]>();
  for (const snapshot of allSnapshots) {
    const list = byAccount.get(snapshot.accountId) ?? [];
    list.push(snapshot);
    byAccount.set(snapshot.accountId, list);
  }
  for (const list of byAccount.values()) {
    list.sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
  }

  const eventDates = [...new Set(allSnapshots.map((s) => s.asOfDate))].sort();

  const points: PortfolioHistoryPoint[] = [];
  for (const date of eventDates) {
    let total = 0;
    for (const accountSnapshots of byAccount.values()) {
      // Latest Snapshot with asOfDate <= date — accountSnapshots is sorted
      // ascending, so the last match walking forward is the latest one.
      let latest: Snapshot | undefined;
      for (const snapshot of accountSnapshots) {
        if (snapshot.asOfDate <= date) {
          latest = snapshot;
        } else {
          break;
        }
      }
      if (!latest) continue;

      // Re-fetched/re-converted every time this Snapshot is carried into a
      // later event date, rather than cached across the loop — real event
      // counts are tiny for this app (ADR-0022), not worth the complexity.
      for (const holding of await listHoldingsForSnapshot(latest.id)) {
        const rate = await getExchangeRate(date, holding.currency, displayCurrency);
        total += Number(holding.value) * rate;
      }
    }
    // TODO(#59): a real cost-basis-over-time series from cash_flows running
    // totals, converted to displayCurrency the same way `value` is above —
    // stubbed at "0" for now so the response shape matches ADR-0006 ahead
    // of that.
    points.push({ date, value: String(total), costBasis: "0" });
  }
  return points;
}

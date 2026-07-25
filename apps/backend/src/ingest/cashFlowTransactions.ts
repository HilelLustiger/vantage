// Shared by assetResolution.ts, assetReviewFlow.ts, and snapshotCreation.ts
// — the same filter must run identically at every stage or the positional
// resolvedAssetIds alignment (parsedData.holdings + this filtered list)
// desyncs across the pipeline. See ADR-0023 and #38.
//
// Which kinds count as a real external cash flow: ADR-0023's own Context
// already settled this ("only external deposits/withdrawals/transfers");
// dividend/interest are investment income (performance, not flow, same
// bucket as Gemel's excluded gain_loss/fees), and "other" is unclassifiable
// (ADR-0010's never-guess spirit) — none of the three ever becomes a row.
const FLOW_KINDS: ReadonlySet<string> = new Set(["buy", "deposit", "sell", "withdrawal"]);
const POSITIVE_KINDS: ReadonlySet<string> = new Set(["buy", "deposit"]);

export function isFlowTransaction(transaction: { kind: string }): boolean {
  return FLOW_KINDS.has(transaction.kind);
}

export function selectFlowTransactions<T extends { kind: string }>(transactions: T[]): T[] {
  return transactions.filter(isFlowTransaction);
}

// Derives ADR-0023's per-Asset sign from `kind` alone — buy/deposit is a
// positive contribution to the Asset, sell/withdrawal a negative one —
// rather than trusting each parser's own raw sign. Excellence's `amount` is
// signed from the *cash account's* perspective (a buy is a cash decrease),
// the inverse of what's wanted here; Hapoalim's is unsigned. Taking the
// magnitude and re-applying sign from `kind` is correct for both. Only
// meaningful for the FLOW_KINDS subset — call after selectFlowTransactions.
export function deriveFlowAmount(kind: string, amount: string): string {
  const magnitude = Math.abs(Number(amount));
  return POSITIVE_KINDS.has(kind) ? String(magnitude) : String(-magnitude);
}

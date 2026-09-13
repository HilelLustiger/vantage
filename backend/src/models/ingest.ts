// Backend-internal domain types for the ingest pipeline — Snapshot,
// Holding, CashFlow. Deliberately not part of dto/ — nothing in web/ ever
// consumes these directly (they only ever surface pre-aggregated, through
// Portfolio/AssetHistory/DocumentReview).

export interface Snapshot {
  id: string;
  accountId: string;
  documentId: string;
  asOfDate: string;
  isActive: boolean;
  supersededBySnapshotId: string | null;
}

export interface Holding {
  id: string;
  snapshotId: string;
  assetId: string;
  quantity: string;
  /** Value in `currency`, never converted. */
  value: string;
  currency: string;
  /** Only ever set when the source institution states one directly. */
  purchaseCostIls?: string;
}

// A dated cash-flow event for one Asset.
export type CashFlowSource =
  | "derived_period_aggregate" // e.g. a fund's deposits/withdrawals fields
  | "ingested_transaction" // a real dated row from an itemized statement
  | "derived_cost_basis_delta"; // purchaseCostIls diff across our own Snapshots

export interface CashFlow {
  id: string;
  accountId: string;
  assetId: string;
  documentId: string;
  date: string;
  /** Signed: positive = contributed/bought, negative = withdrawn/sold. */
  amount: string;
  currency: string;
  /** Free-form transaction nature from the source ("buy", "sell",
   * "dividend", "period_net_flow", ...) — descriptive and strengthens the
   * dedup key; NOT authoritative for direction (amount's sign is). */
  kind: string;
  source: CashFlowSource;
  /** Only ever present for source: "ingested_transaction" — the
   * statement's own running balance-after figure, used for dedup. */
  runningBalanceAfter?: string;
}

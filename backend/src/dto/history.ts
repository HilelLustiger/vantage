export interface HistoryEvent {
  kind: "statement_imported" | "purchase" | "sale";
  /** statement_imported only — names the institution for the tooltip's icon+label row. */
  institutionName?: string;
  /** purchase/sale only — names the asset whose cash flow moved cost basis. */
  assetName?: string;
  quantity?: string;
}

export interface NetWorthHistoryPoint {
  date: string;
  portfolioValue: string;
  costBasis: string;
  event?: HistoryEvent;
}

// Net worth over time — the one Dashboard aggregate that can't be derived
// from a snapshot of current holdings (see the comment on HoldingRow in
// holdings.ts), since it's a time series, not "now".
export type NetWorthHistory = NetWorthHistoryPoint[];

// Domain types shared between `web` and `backend`. See docs/DOMAIN.md for
// the definitions these mirror. Types only — no logic, no runtime values.

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface Institution {
  id: string;
  name: string;
}

export interface Account {
  id: string;
  institutionId: string;
  name: string;
  /** Users this Account is visible to — one (individual) or several (joint). */
  ownerUserIds: string[];
}

export type AssetType = "stock" | "etf" | "mutual_fund" | "bond" | "cash";

export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  ticker?: string;
  isin?: string;
  /** TASE (or equivalent exchange) security number — see ADR 0024. */
  securityNumber?: string;
}

export interface Holding {
  id: string;
  snapshotId: string;
  assetId: string;
  quantity: string;
  /** Value in `currency`, never converted — see ADR 0012. */
  value: string;
  currency: string;
  /** Only ever set when the source institution states one directly
   * (Excellence) — see ADR 0023/#39. */
  purchaseCostIls?: string;
}

export interface Snapshot {
  id: string;
  accountId: string;
  documentId: string;
  asOfDate: string;
  isActive: boolean;
  supersededBySnapshotId: string | null;
}

export type DocumentStatus =
  | "uploaded"
  | "processing"
  | "needs_review"
  | "committed"
  | "failed"
  | "duplicate";

// PDF only for now — see ADR 0015. CSV later is just another format key.
export type DocumentFormat = "pdf";

// Which feature this Document belongs to — see ADR 0013. Only Investments
// exists today; Transactions isn't designed yet.
export type DocumentFeature = "investments" | "transactions";

// One failed check from the parser service's ExtractionEngine — either a
// verify_matches mismatch or a required field/table that was missing
// entirely (computed/claimed null in that case). See ADR-0026.
export interface ValidityCheckResult {
  name: string;
  computed: number | null;
  claimed: number | null;
  matched: boolean;
}

export interface Document {
  id: string;
  accountId: string;
  status: DocumentStatus;
  checksum: string;
  format: DocumentFormat;
  feature: DocumentFeature;
  /** The statement's covered period, if supplied at upload time. */
  dateRangeStart?: string;
  dateRangeEnd?: string;
  uploadedAt: string;
  /** Why parsing failed, when status is "failed" — from the parser service. */
  failureReason?: string;
  /** Why status is "needs_review" *because the parser itself* flagged it
   * (ADR-0026) — distinct from the existing asset-resolution needs_review
   * path (ADR-0010), which has no failed checks, just unmatched Holdings.
   * Undefined for every other needs_review cause. */
  validityFailedChecks?: ValidityCheckResult[];
}

export interface PortfolioLine {
  assetId: string;
  quantity: string;
  /** Converted at read time to the viewer's display currency — see ADR 0012. */
  value: string;
  currency: string;
}

export interface Portfolio {
  userId: string;
  lines: PortfolioLine[];
}

// See ADR 0022: breakdown of the aggregate Portfolio by each Holding's
// original currency — `value` stays raw/unconverted per bucket, only
// `percentageOfPortfolio` needs a conversion to be comparable across
// currencies.
export interface CurrencyBreakdownLine {
  currency: string;
  value: string;
  percentageOfPortfolio: number;
}

export interface CurrencyBreakdown {
  userId: string;
  lines: CurrencyBreakdownLine[];
}

// Net worth over time — one point per distinct Snapshot event date across
// every Account, carrying forward each Account's latest Snapshot as-of
// that date. `value` is converted to the requested display currency using
// that point's own date's exchange rate — see ADR 0012.
export interface PortfolioHistoryPoint {
  date: string;
  value: string;
}

export interface PortfolioHistory {
  userId: string;
  points: PortfolioHistoryPoint[];
}

// See ADR 0023/#40 — the institution's own directly-stated cost basis is
// preferred; the derived sum only fills in when it isn't available.
export type CostBasisSource = "institution_stated" | "derived_from_cash_flows";

// Entity-level, native-currency holdings view — see ADR 0022. Never
// converted, so no display-currency concept applies here at all. The
// costBasis/profit/... fields are ADR 0023's per-Asset return metrics
// (#40/#41/#42) — computed in this same native currency, no FX needed.
export interface AssetCurrencyValue {
  currency: string;
  value: string;
  costBasis: string;
  costBasisSource: CostBasisSource;
  profit: string;
  /** null when costBasis is 0 — not meaningful, not 0%/Infinity/NaN. */
  simpleReturnPct: number | null;
  /** Money-weighted, annualized return. null when not computable or the
   * position is under the minimum holding period — see #42. */
  xirr: number | null;
  taxOnProfit: string;
  netOfTax: string;
}

export interface AssetHoldingBreakdown {
  assetId: string;
  /** Summed across every Account/currency — share count, not money. */
  quantity: string;
  valuesByCurrency: AssetCurrencyValue[];
}

export interface PortfolioByAsset {
  userId: string;
  assets: AssetHoldingBreakdown[];
}

// The manual-confirmation flow for a needs_review Document — see ADR 0010.
export interface DocumentReviewLine {
  index: number;
  assetName: string;
  quantity: string;
  value: string;
  currency: string;
  /** Set only when auto-matching already resolved this line — shown read-only. */
  resolvedAssetId?: string;
}

export interface DocumentReview {
  documentId: string;
  lines: DocumentReviewLine[];
}

export type DocumentResolution =
  | { index: number; assetId: string }
  | {
      index: number;
      newAsset: {
        type: AssetType;
        name: string;
        ticker?: string;
        isin?: string;
        securityNumber?: string;
      };
    };

// A dated cash-flow event for one Asset — see ADR 0023. Never an
// Investments/Transactions-feature "transaction" (ADR 0006's separate,
// not-yet-designed bank-activity feature) — deliberately named to avoid
// that collision.
export type CashFlowSource =
  | "derived_period_aggregate" // e.g. Gemel's deposits/withdrawals fields
  | "ingested_transaction" // a real dated row from an itemized statement
  | "derived_cost_basis_delta"; // Excellence purchaseCostIls diff across our own Snapshots

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
   * "dividend", "period_net_flow", ...) — descriptive and strengthens
   * the dedup key; NOT authoritative for direction (amount's sign is). */
  kind: string;
  source: CashFlowSource;
  /** Only ever present for source: "ingested_transaction" — the
   * statement's own running balance-after figure, used for dedup. */
  runningBalanceAfter?: string;
}

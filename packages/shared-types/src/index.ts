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
}

export interface Holding {
  id: string;
  snapshotId: string;
  assetId: string;
  quantity: string;
  /** Value in `currency`, never converted — see ADR 0012. */
  value: string;
  currency: string;
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
      newAsset: { type: AssetType; name: string; ticker?: string; isin?: string };
    };

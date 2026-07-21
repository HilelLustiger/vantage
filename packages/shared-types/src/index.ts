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

export interface Document {
  id: string;
  accountId: string;
  status: DocumentStatus;
  checksum: string;
  uploadedAt: string;
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

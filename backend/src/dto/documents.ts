import type { NewAssetInput } from "./assets.js";

export type DocumentStatus =
  "uploaded" | "processing" | "needs_review" | "committed" | "failed" | "duplicate";

export interface DocumentSummary {
  id: string;
  accountId: string;
  accountName: string;
  uploadedAt: string;
  status: DocumentStatus;
  /** Only present when status === "failed". */
  failureReason?: string;
}

export type TransactionKind = "buy" | "sell" | "deposit" | "withdrawal";

// A statement can report two distinct things about an Asset: what it's
// worth now (a "holding" line) and dated activity during the period (a
// "transaction" line) — independent of each other. Never derive one from a
// change in the other (see the deleted models/ingest.ts and its
// CashFlowSource "derived_*" variants for why: it required a whole
// Snapshot-diffing layer to do so, for a value a statement usually just
// states directly when it has it at all).
export interface ExtractedHoldingLine {
  index: number;
  kind: "holding";
  assetName: string;
  quantity: string;
  value: string;
  currency: string;
  /** Set only when auto-matching already resolved this line — shown read-only. */
  resolvedAssetId?: string;
}

export interface ExtractedTransactionLine {
  index: number;
  kind: "transaction";
  assetName: string;
  occurredAt: string;
  transactionKind: TransactionKind;
  /** Absent for a pure-cash deposit/withdrawal (no Asset quantity moves). */
  quantityDelta?: string;
  amount: string;
  currency: string;
  /** Set only when auto-matching already resolved this line — shown read-only. */
  resolvedAssetId?: string;
}

export type ExtractedLine = ExtractedHoldingLine | ExtractedTransactionLine;

export interface ValidityCheckResult {
  name: string;
  computed: number | null;
  claimed: number | null;
  matched: boolean;
}

// Local-extraction-only fields for the privacy-preflight-abort path — these
// never left the device, unlike everything an LLM extraction would produce.
export interface LocallyConfirmedFields {
  accountHolder: string;
  accountNumber: string;
  asOfDate: string;
  statementBalance?: string;
}

// The three review reasons genuinely carry different data (ADR-0008's dual-
// pane shape is shared, but the payload isn't) — a discriminated union says
// so directly instead of leaving fields optional across all three.
export type DocumentReview =
  | { reason: "asset_resolution"; lines: ExtractedLine[] }
  | { reason: "validity_failure"; lines: ExtractedLine[]; failedChecks: ValidityCheckResult[] }
  | { reason: "privacy_preflight_aborted"; locallyConfirmed: LocallyConfirmedFields };

export type DocumentResolution =
  | { index: number; kind: "holding"; assetId: string }
  | { index: number; kind: "holding"; newAsset: NewAssetInput }
  | { index: number; kind: "transaction"; assetId: string }
  | { index: number; kind: "transaction"; newAsset: NewAssetInput }
  // privacy_preflight_aborted only: no extracted line exists to source
  // quantity/value/currency from, so they travel here instead of being
  // looked up by index.
  | {
      manualHolding: {
        assetId?: string;
        newAsset?: NewAssetInput;
        quantity: string;
        value: string;
        currency: string;
      };
    };

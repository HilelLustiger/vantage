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

// Already normalized against the source PDF's own mediabox origin — (0, 0)
// is always this page's own top-left corner, regardless of what the PDF
// itself declares (parser/segmentation.py's Bbox: confirmed necessary
// against a real institution export whose mediabox didn't start at (0, 0)).
// Units are PDF points, matching DocumentReview's pageWidth/pageHeight —
// the review UI scales both by the same factor to position its overlay.
export interface Bbox {
  x0: number;
  top: number;
  x1: number;
  bottom: number;
}

// One line of the original document, in page order — the human approval
// gate shown before parser's /extract is ever called (every document, for
// now — see the ADR-0008 privacy discussion). "redacted" lines carry no
// text at all (parser/segmentation.py never lets it leave that process) —
// only its position, so the review UI can still draw a placeholder in the
// right spot on the page. "flagged" lines are shown but start unselected —
// the human must deliberately include them.
export type DocumentLine =
  | { index: number; status: "redacted"; text: null; flagReason: null; bbox: Bbox }
  | { index: number; status: "included"; text: string; flagReason: null; bbox: Bbox }
  | { index: number; status: "flagged"; text: string; flagReason: string; bbox: Bbox };

export interface ValidityCheckResult {
  name: string;
  computed: number | null;
  claimed: number | null;
  matched: boolean;
}

// The two review reasons genuinely carry different data (ADR-0008's dual-
// pane shape is shared, but the payload isn't) — a discriminated union says
// so directly instead of leaving fields optional across both.
export type DocumentReview =
  | { reason: "content_review"; lines: DocumentLine[]; pageWidth: number; pageHeight: number }
  | {
      reason: "extraction_review";
      lines: ExtractedLine[];
      failedChecks: ValidityCheckResult[];
      // A holding's "current value" only means something relative to a
      // date — the statement's own, captured once per document (stage 1,
      // locally, never guessed by the model) rather than per line.
      asOfDate: string;
    };

// Corrections to what the model read off the document — orthogonal to
// which Asset a line resolves to, so they ride along on every holding/
// transaction resolution variant rather than forcing a 2x fan-out of
// variants. Omitted fields mean "the model's own value stands as-is".
export interface HoldingOverride {
  value?: string;
  quantity?: string;
  currency?: string;
}

export interface TransactionOverride {
  amount?: string;
  quantityDelta?: string;
  occurredAt?: string;
  currency?: string;
}

export type DocumentResolution =
  | ({ index: number; kind: "holding"; assetId: string } & HoldingOverride)
  | ({ index: number; kind: "holding"; newAsset: NewAssetInput } & HoldingOverride)
  // A line parser already auto-matched (ExtractedLine.resolvedAssetId set)
  // needs no asset choice at all — this variant exists purely so its
  // figures can still be corrected before committing.
  | ({ index: number; kind: "holding" } & HoldingOverride)
  | ({ index: number; kind: "transaction"; assetId: string } & TransactionOverride)
  | ({ index: number; kind: "transaction"; newAsset: NewAssetInput } & TransactionOverride)
  | ({ index: number; kind: "transaction" } & TransactionOverride)
  // content_review only: which line indices the user approved sending —
  // an explicit allowlist from the human, not a diff off some default.
  | { approveContentReview: { includedIndices: number[] } };

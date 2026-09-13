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

export interface ExtractedLine {
  index: number;
  assetName: string;
  quantity: string;
  value: string;
  currency: string;
  /** Set only when auto-matching already resolved this line — shown read-only. */
  resolvedAssetId?: string;
}

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
  | { index: number; assetId: string }
  | { index: number; newAsset: NewAssetInput }
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

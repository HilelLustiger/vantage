import type {
  Asset,
  DocumentLine,
  ExtractedLine,
  TransactionKind,
  ValidityCheckResult,
} from "../dto/index.js";

export interface HoldingCommit {
  assetId: string;
  quantity: string;
  value: string;
  currency: string;
}

export interface TransactionCommit {
  assetId: string;
  occurredAt: string;
  // "0" for a pure-cash deposit/withdrawal (no Asset quantity moves).
  quantityDelta: string;
  amount: string;
  currency: string;
  kind: TransactionKind;
}

// `parser` is a separate service (Python, for its PDF/table-extraction
// ecosystem and — since it's the only component that ever sees a raw
// document or talks to an external LLM — security isolation: it holds no
// DB credentials, so a compromised parser is bounded to one document, not
// the whole database. See ADR-0001. Reached only over Docker's internal
// network, never exposed to the host.
const PARSER_URL = process.env.PARSER_URL ?? "http://parser:8000";

// POST /segment's result — stages 1+2 only, never calls the model.
// identityValues is backend-internal only: held until resolveDocument hands
// it back to /extract, never forwarded to web as part of DocumentReview
// (see getDocumentReview in services/documents.ts).
export type SegmentResult =
  | {
      outcome: "needs_review";
      asOfDate: string | null;
      review: {
        reason: "content_review";
        lines: DocumentLine[];
        pageWidth: number;
        pageHeight: number;
        identityValues: Record<string, string | null>;
      };
    }
  | { outcome: "failed"; reason: string };

export async function segmentDocument(file: Buffer): Promise<SegmentResult> {
  const formData = new FormData();
  formData.set("file", new Blob([file]), "document.pdf");

  const response = await fetch(`${PARSER_URL}/segment`, { method: "POST", body: formData });
  if (!response.ok) {
    throw new Error(`parser request failed with status ${response.status}`);
  }
  return (await response.json()) as SegmentResult;
}

// POST /extract's result — stages 3+4, only ever called with content a
// human has already approved. holdings/transactions are independent — see
// the "kind" split on ExtractedLine (dto/documents.ts) for why one is never
// derived from the other. Either can be empty depending on what the
// statement reports.
export type ParseDocumentResult =
  | {
      outcome: "committed";
      asOfDate: string;
      holdings: HoldingCommit[];
      transactions: TransactionCommit[];
    }
  | {
      outcome: "needs_review";
      asOfDate: string | null;
      review: {
        reason: "extraction_review";
        lines: ExtractedLine[];
        failedChecks: ValidityCheckResult[];
      };
    }
  | { outcome: "failed"; reason: string };

export async function extractFromBuffer(
  buffer: string,
  identityValues: Record<string, string | null>,
  existingAssets: Asset[],
): Promise<ParseDocumentResult> {
  const formData = new FormData();
  formData.set("buffer", buffer);
  formData.set("identityValues", JSON.stringify(identityValues));
  formData.set("existingAssets", JSON.stringify(existingAssets));

  const response = await fetch(`${PARSER_URL}/extract`, { method: "POST", body: formData });
  if (!response.ok) {
    throw new Error(`parser request failed with status ${response.status}`);
  }
  return (await response.json()) as ParseDocumentResult;
}

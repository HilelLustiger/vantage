import type { Asset, DocumentReview, TransactionKind } from "../dto/index.js";

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

export interface ParseDocumentInput {
  file: Buffer;
  existingAssets: Asset[];
}

// holdings/transactions are independent — see the "kind" split on
// ExtractedLine (dto/documents.ts) for why one is never derived from the
// other. Either can be empty depending on what the statement reports.
export type ParseDocumentResult =
  | {
      outcome: "committed";
      asOfDate: string;
      holdings: HoldingCommit[];
      transactions: TransactionCommit[];
    }
  | { outcome: "needs_review"; asOfDate: string | null; review: DocumentReview }
  | { outcome: "failed"; reason: string };

// Placeholder — extraction, asset matching, validity checks, and the
// privacy preflight are designed and implemented separately (next design
// pass). Until then every upload fails here, which is enough to build and
// test the rest of the ingest flow (upload/review/resolve) against.
export async function parseDocument(_input: ParseDocumentInput): Promise<ParseDocumentResult> {
  throw new Error("parseDocument is not implemented yet");
}

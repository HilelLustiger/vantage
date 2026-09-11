import type { DocumentStatus, ValidityCheckResult } from "../dto/index.js";
import { assertCanTransition, IllegalDocumentTransitionError } from "../entities/Document.js";
import {
  findDocumentById,
  updateDocumentFailure,
  updateDocumentNeedsReview,
  updateDocumentNeedsReviewForValidityFailure,
  updateDocumentParsedData,
  updateDocumentResolvedHoldings,
  updateDocumentStatus,
} from "../db/documents.js";

export { IllegalDocumentTransitionError };

async function getDocumentOrThrow(documentId: string) {
  const document = await findDocumentById(documentId);
  if (!document) {
    throw new Error(`Document ${documentId} not found`);
  }
  return document;
}

export async function transitionDocument(documentId: string, to: DocumentStatus) {
  const document = await getDocumentOrThrow(documentId);
  assertCanTransition(document, to);
  return updateDocumentStatus(documentId, to);
}

// A parse failure (unreadable file, unrecognized institution) is a full,
// honest "failed" per ADR-0004 — reason comes straight from the parser
// service's response.
export async function transitionDocumentWithFailure(documentId: string, reason: string) {
  const document = await getDocumentOrThrow(documentId);
  assertCanTransition(document, "failed");
  return updateDocumentFailure(documentId, reason);
}

// A successful parse alone can't honestly reach needs_review or committed
// yet — Asset resolution hasn't run, so the Document stays "processing";
// this just stashes the raw result for it to pick up.
export async function storeParsedData(documentId: string, data: unknown) {
  return updateDocumentParsedData(documentId, data);
}

// All holdings auto-matched (or there were none) — nothing for a human to
// review, but Snapshot/Holding creation hasn't run yet, so the Document
// stays "processing" with the match results stashed alongside parsedData.
export async function storeResolvedHoldings(
  documentId: string,
  resolvedAssetIds: (string | null)[],
) {
  return updateDocumentResolvedHoldings(documentId, resolvedAssetIds);
}

// At least one holding couldn't be confidently matched — per ADR-0004, that
// holds the Document for human confirmation rather than guessing or
// auto-creating an Asset.
export async function transitionDocumentToNeedsReview(
  documentId: string,
  resolvedAssetIds: (string | null)[],
) {
  const document = await getDocumentOrThrow(documentId);
  assertCanTransition(document, "needs_review");
  return updateDocumentNeedsReview(documentId, resolvedAssetIds);
}

// The parser service itself flagged this Document for review (ADR-0008) —
// either ExtractionEngine's completeness gate found a required field/table
// missing, or an institution's reconcile() found a check that didn't
// match. A distinct path from transitionDocumentToNeedsReview above (which
// is ADR-0004's asset-resolution case, reached only after a fully
// successful parse): this one fires instead of ever reaching asset
// resolution at all. values are the raw extracted data (same shape
// storeParsedData would have stashed on success) — carried forward for a
// future manual-correction form (not designed yet) to show the user.
export async function transitionDocumentToNeedsReviewForValidityFailure(
  documentId: string,
  values: unknown,
  failedChecks: ValidityCheckResult[],
) {
  const document = await getDocumentOrThrow(documentId);
  assertCanTransition(document, "needs_review");
  return updateDocumentNeedsReviewForValidityFailure(documentId, values, failedChecks);
}

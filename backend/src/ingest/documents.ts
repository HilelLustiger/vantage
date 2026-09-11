import { eq } from "drizzle-orm";
import type { DocumentStatus, ValidityCheckResult } from "../dto/index.js";
import { db } from "../shared/db/client.js";
import { documents } from "../shared/db/schema.js";
import { findDocumentById } from "../shared/db/documents.js";

// See docs/ADR/0011-document-lifecycle-separate-state-machine.md.
const TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  uploaded: ["processing", "duplicate"],
  processing: ["needs_review", "committed", "failed"],
  needs_review: ["committed", "failed"],
  committed: [],
  failed: [],
  duplicate: [],
};

export class IllegalDocumentTransitionError extends Error {
  constructor(from: DocumentStatus, to: DocumentStatus) {
    super(`Cannot transition document from "${from}" to "${to}"`);
    this.name = "IllegalDocumentTransitionError";
  }
}

export async function transitionDocument(documentId: string, to: DocumentStatus) {
  const document = await findDocumentById(documentId);
  if (!document) {
    throw new Error(`Document ${documentId} not found`);
  }
  if (!TRANSITIONS[document.status].includes(to)) {
    throw new IllegalDocumentTransitionError(document.status, to);
  }

  const [updated] = await db
    .update(documents)
    .set({ status: to })
    .where(eq(documents.id, documentId))
    .returning();
  return updated;
}

// A parse failure (unreadable file, unrecognized institution) is a full,
// honest "failed" per ADR-0011 — reason comes straight from the parser
// service's response.
export async function transitionDocumentWithFailure(documentId: string, reason: string) {
  const document = await findDocumentById(documentId);
  if (!document) {
    throw new Error(`Document ${documentId} not found`);
  }
  if (!TRANSITIONS[document.status].includes("failed")) {
    throw new IllegalDocumentTransitionError(document.status, "failed");
  }

  const [updated] = await db
    .update(documents)
    .set({ status: "failed", failureReason: reason })
    .where(eq(documents.id, documentId))
    .returning();
  return updated;
}

// A successful parse alone can't honestly reach needs_review or committed
// yet — Asset resolution (#20) hasn't run, so the Document stays
// "processing"; this just stashes the raw result for it to pick up.
export async function storeParsedData(documentId: string, data: unknown) {
  const [updated] = await db
    .update(documents)
    .set({ parsedData: data })
    .where(eq(documents.id, documentId))
    .returning();
  return updated;
}

// All holdings auto-matched (or there were none) — nothing for a human to
// review, but #21 (Snapshot/Holding creation) hasn't run yet, so the
// Document stays "processing" with the match results stashed alongside
// parsedData.
export async function storeResolvedHoldings(
  documentId: string,
  resolvedAssetIds: (string | null)[],
) {
  const [updated] = await db
    .update(documents)
    .set({ resolvedHoldings: resolvedAssetIds })
    .where(eq(documents.id, documentId))
    .returning();
  return updated;
}

// At least one holding couldn't be confidently matched — per ADR-0010, that
// holds the Document for human confirmation rather than guessing or
// auto-creating an Asset.
export async function transitionDocumentToNeedsReview(
  documentId: string,
  resolvedAssetIds: (string | null)[],
) {
  const document = await findDocumentById(documentId);
  if (!document) {
    throw new Error(`Document ${documentId} not found`);
  }
  if (!TRANSITIONS[document.status].includes("needs_review")) {
    throw new IllegalDocumentTransitionError(document.status, "needs_review");
  }

  const [updated] = await db
    .update(documents)
    .set({ status: "needs_review", resolvedHoldings: resolvedAssetIds })
    .where(eq(documents.id, documentId))
    .returning();
  return updated;
}

// The parser service itself flagged this Document for review (ADR-0026) —
// either ExtractionEngine's completeness gate found a required field/table
// missing, or an institution's reconcile() found a check that didn't
// match. A distinct path from transitionDocumentToNeedsReview above (which
// is ADR-0010's asset-resolution case, reached only after a fully
// successful parse): this one fires instead of ever reaching asset
// resolution at all. values are the raw extracted data (same shape
// storeParsedData would have stashed on success) — carried forward for a
// future manual-correction form (not designed yet) to show the user.
export async function transitionDocumentToNeedsReviewForValidityFailure(
  documentId: string,
  values: unknown,
  failedChecks: ValidityCheckResult[],
) {
  const document = await findDocumentById(documentId);
  if (!document) {
    throw new Error(`Document ${documentId} not found`);
  }
  if (!TRANSITIONS[document.status].includes("needs_review")) {
    throw new IllegalDocumentTransitionError(document.status, "needs_review");
  }

  const [updated] = await db
    .update(documents)
    .set({ status: "needs_review", parsedData: values, validityFailedChecks: failedChecks })
    .where(eq(documents.id, documentId))
    .returning();
  return updated;
}

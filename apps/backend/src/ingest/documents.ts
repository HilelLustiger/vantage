import { eq } from "drizzle-orm";
import type { DocumentStatus } from "@vantage/shared-types";
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

// A successful parse alone can't honestly reach needs_review (#20 — Asset
// resolution) or committed (#21 — Snapshot/Holding creation), so the
// Document stays "processing"; this just stashes the result for those
// issues to pick up.
export async function storeParsedData(documentId: string, data: unknown) {
  const [updated] = await db
    .update(documents)
    .set({ parsedData: data })
    .where(eq(documents.id, documentId))
    .returning();
  return updated;
}

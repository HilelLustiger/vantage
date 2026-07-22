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

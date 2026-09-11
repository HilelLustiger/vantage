// The Document state machine — see ADR-0004. Pure business rule, no DB
// awareness: db/documents.ts persists a transition once entities/Document.ts
// says it's legal; ingest/documents.ts orchestrates the two.
import type { Document, DocumentStatus } from "../dto/index.js";

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

export function assertCanTransition(document: Document, to: DocumentStatus): void {
  if (!TRANSITIONS[document.status].includes(to)) {
    throw new IllegalDocumentTransitionError(document.status, to);
  }
}

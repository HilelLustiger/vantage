import { and, eq } from "drizzle-orm";
import type { DocumentStatus, DocumentSummary } from "../dto/index.js";
import { db } from "../db/client.js";
import {
  accounts,
  documentPendingReviews,
  documents,
  type DocumentInsert,
  type DocumentRow,
  type PendingReview,
} from "../db/schema.js";

async function hydrate(rows: DocumentRow[]): Promise<DocumentSummary[]> {
  if (rows.length === 0) return [];

  const accountRows = await db.select({ id: accounts.id, name: accounts.name }).from(accounts);
  const accountNameById = new Map(accountRows.map((a) => [a.id, a.name]));

  return rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    accountName: accountNameById.get(row.accountId) ?? "",
    uploadedAt: row.uploadedAt.toISOString(),
    status: row.status,
    failureReason: row.failureReason ?? undefined,
  }));
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  const rows = await db.select().from(documents);
  return hydrate(rows);
}

export async function findDocumentById(id: string): Promise<DocumentSummary | undefined> {
  const rows = await db.select().from(documents).where(eq(documents.id, id));
  const [document] = await hydrate(rows);
  return document;
}

// The raw row — for callers that need status/asOfDate directly rather than
// the hydrated summary shape (getDocumentReview, resolveDocument).
export async function findDocumentRowById(id: string): Promise<DocumentRow | undefined> {
  const [row] = await db.select().from(documents).where(eq(documents.id, id));
  return row;
}

// For DocumentStatus "duplicate" — a checksum already seen on this Account.
export async function findDocumentByChecksum(
  accountId: string,
  checksum: string,
): Promise<DocumentRow | undefined> {
  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.accountId, accountId), eq(documents.checksum, checksum)));
  return document;
}

export async function insertDocument(input: DocumentInsert): Promise<DocumentRow> {
  const [document] = await db.insert(documents).values(input).returning();
  return document;
}

export async function updateDocumentStatus(
  id: string,
  status: DocumentStatus,
  failureReason?: string,
): Promise<void> {
  await db.update(documents).set({ status, failureReason }).where(eq(documents.id, id));
}

// Parser found something the user must confirm before this Document can
// commit. Lives in its own table (see PendingReview in db/schema.ts) so
// `documents` itself only ever holds finished/stable state.
export async function savePendingReview(
  id: string,
  asOfDate: string | null,
  payload: PendingReview,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(documents)
      .set({ status: "needs_review", asOfDate })
      .where(eq(documents.id, id));
    await tx
      .insert(documentPendingReviews)
      .values({ documentId: id, payload })
      .onConflictDoUpdate({ target: documentPendingReviews.documentId, set: { payload } });
  });
}

export async function findPendingReview(id: string): Promise<PendingReview | undefined> {
  const [row] = await db
    .select()
    .from(documentPendingReviews)
    .where(eq(documentPendingReviews.documentId, id));
  return row?.payload;
}

export async function commitDocument(id: string, asOfDate: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(documents).set({ status: "committed", asOfDate }).where(eq(documents.id, id));
    await tx.delete(documentPendingReviews).where(eq(documentPendingReviews.documentId, id));
  });
}

// A resolve attempt failed (see services/documents.ts) — the Document is
// terminal, so whatever pending review it had is moot.
export async function failDocument(id: string, reason: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(documents)
      .set({ status: "failed", failureReason: reason })
      .where(eq(documents.id, id));
    await tx.delete(documentPendingReviews).where(eq(documentPendingReviews.documentId, id));
  });
}

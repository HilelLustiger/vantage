import { and, eq, inArray, ne, notInArray } from "drizzle-orm";
import type { Document } from "@vantage/shared-types";
import { db } from "./client.js";
import { accountUsers, documents } from "./schema.js";

// Drizzle returns `uploadedAt` as a Date and null date-range columns as
// null; Document models them as the wire/JSON shape (ISO strings, optional
// fields) — normalize at the boundary, same pattern as assets.ts's toAsset().
//
// parsedData and resolvedHoldings are deliberately dropped here, not spread
// through: they're internal ingest state (raw parser-service output, and
// per-holding Asset match results) meant for #20/#21 to consume internally,
// not for the Document wire type.
function toDocument(row: typeof documents.$inferSelect): Document {
  return {
    id: row.id,
    accountId: row.accountId,
    status: row.status,
    checksum: row.checksum,
    format: row.format,
    feature: row.feature,
    dateRangeStart: row.dateRangeStart ?? undefined,
    dateRangeEnd: row.dateRangeEnd ?? undefined,
    uploadedAt: row.uploadedAt.toISOString(),
    failureReason: row.failureReason ?? undefined,
    validityFailedChecks: row.validityFailedChecks ?? undefined,
  };
}

export async function insertDocument(input: {
  accountId: string;
  checksum: string;
  dateRangeStart?: string;
  dateRangeEnd?: string;
}) {
  const [document] = await db
    .insert(documents)
    .values({ ...input, status: "uploaded" })
    .returning();
  return toDocument(document);
}

export async function findDocumentById(id: string) {
  const [document] = await db.select().from(documents).where(eq(documents.id, id));
  return document && toDocument(document);
}

// A checksum counts as a duplicate against another document for the same
// account that isn't itself failed/duplicate (so a rejected upload can be
// retried without being treated as a duplicate of itself).
export async function findActiveDuplicate(
  accountId: string,
  checksum: string,
  excludeId: string,
) {
  const [document] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.accountId, accountId),
        eq(documents.checksum, checksum),
        ne(documents.id, excludeId),
        notInArray(documents.status, ["failed", "duplicate"]),
      ),
    );
  return document && toDocument(document);
}

export async function listDocumentsForUser(userId: string) {
  const ownedRows = await db
    .select({ accountId: accountUsers.accountId })
    .from(accountUsers)
    .where(eq(accountUsers.userId, userId));
  const accountIds = ownedRows.map((r) => r.accountId);
  if (accountIds.length === 0) return [];

  const rows = await db
    .select()
    .from(documents)
    .where(inArray(documents.accountId, accountIds));
  return rows.map(toDocument);
}

export async function findDocumentVisibleToUser(documentId: string, userId: string) {
  const [row] = await db
    .select({ document: documents })
    .from(documents)
    .innerJoin(accountUsers, eq(accountUsers.accountId, documents.accountId))
    .where(and(eq(documents.id, documentId), eq(accountUsers.userId, userId)));
  return row && toDocument(row.document);
}

// A deliberately narrow, separate accessor for the #10 review flow — the
// only place parsedData/resolvedHoldings ever leave this module. Doesn't
// touch toDocument()/the general Document type's "never expose these"
// invariant. undefined if not visible, or not currently needs_review.
export async function findNeedsReviewDetailVisibleToUser(documentId: string, userId: string) {
  const [row] = await db
    .select({ document: documents })
    .from(documents)
    .innerJoin(accountUsers, eq(accountUsers.accountId, documents.accountId))
    .where(and(eq(documents.id, documentId), eq(accountUsers.userId, userId)));
  if (!row || row.document.status !== "needs_review") {
    return undefined;
  }
  return {
    accountId: row.document.accountId,
    parsedData: row.document.parsedData,
    resolvedHoldings: row.document.resolvedHoldings as (string | null)[] | null,
  };
}

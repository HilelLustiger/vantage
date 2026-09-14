import { and, eq } from "drizzle-orm";
import type {
  DocumentStatus,
  DocumentSummary,
  ExtractedLine,
  LocallyConfirmedFields,
  ValidityCheckResult,
} from "../dto/index.js";
import { db } from "../db/client.js";
import { accounts, documents, type DocumentInsert, type DocumentRow } from "../db/schema.js";

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

// The raw row, for callers that need parsedLines/locallyConfirmed/
// validityFailedChecks — getDocumentReview and resolveDocument, not the
// list/summary endpoints.
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
// commit — reason is derived later (by getDocumentReview) from which of
// locallyConfirmed/validityFailedChecks is populated, not stored directly.
export async function saveDocumentReview(
  id: string,
  input: {
    asOfDate: string | null;
    parsedLines?: ExtractedLine[];
    locallyConfirmed?: LocallyConfirmedFields;
    validityFailedChecks?: ValidityCheckResult[];
  },
): Promise<void> {
  await db
    .update(documents)
    .set({ status: "needs_review", ...input })
    .where(eq(documents.id, id));
}

export async function commitDocument(id: string, asOfDate: string): Promise<void> {
  await db.update(documents).set({ status: "committed", asOfDate }).where(eq(documents.id, id));
}

import { and, eq } from "drizzle-orm";
import type { DocumentStatus, DocumentSummary } from "../dto/index.js";
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

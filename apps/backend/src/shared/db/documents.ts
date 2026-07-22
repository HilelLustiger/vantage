import { and, eq, ne, notInArray } from "drizzle-orm";
import { db } from "./client.js";
import { documents } from "./schema.js";

export async function insertDocument(input: { accountId: string; checksum: string }) {
  const [document] = await db
    .insert(documents)
    .values({ ...input, status: "uploaded" })
    .returning();
  return document;
}

export async function findDocumentById(id: string) {
  const [document] = await db.select().from(documents).where(eq(documents.id, id));
  return document;
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
  return document;
}

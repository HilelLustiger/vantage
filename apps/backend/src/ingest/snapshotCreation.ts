// The last pipeline stage: turn a fully-resolved parse into a Snapshot +
// Holdings and commit the Document. See ADR-0009 (immutable, supersede
// rather than overwrite) and ADR-0012 (store original currency).
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../shared/db/client.js";
import { documents, holdings, snapshots } from "../shared/db/schema.js";

const parsedDataSchema = z
  .object({
    asOfDate: z.string().optional(),
    holdings: z.array(
      z
        .object({
          assetName: z.string(),
          quantity: z.string(),
          value: z.string(),
          currency: z.string(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

// Real statement asOfDate formats confirmed against all 8 sandbox/samples/
// statements: both DD.MM.YYYY and DD/MM/YYYY appear. The fixed \d{2} for
// day/month also rejects the one known-corrupted real value
// ("130.06.2026", a documented Hapoalim extraction quirk from #24) — it
// can't match a 3-digit day, so this returns null rather than silently
// accepting nonsense.
export function parseStatementDate(raw: string): string | null {
  const match = raw.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const dayNum = Number(day);
  const monthNum = Number(month);
  if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12) return null;
  return `${year}-${month}-${day}`;
}

// resolvedAssetIds must have no nulls — guaranteed by the caller, which
// only reaches this from #20's "all matched" branch.
export async function commitSnapshot(
  documentId: string,
  accountId: string,
  parsedData: unknown,
  resolvedAssetIds: (string | null)[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const parsed = parsedDataSchema.safeParse(parsedData);
  if (!parsed.success) {
    return { ok: false, reason: "parsed data was not in the expected shape" };
  }
  if (!parsed.data.asOfDate) {
    return { ok: false, reason: "parsed data did not include a statement date" };
  }
  const asOfDate = parseStatementDate(parsed.data.asOfDate);
  if (!asOfDate) {
    return { ok: false, reason: `could not parse statement date "${parsed.data.asOfDate}"` };
  }

  await db.transaction(async (tx) => {
    const [existingActive] = await tx
      .select()
      .from(snapshots)
      .where(
        and(
          eq(snapshots.accountId, accountId),
          eq(snapshots.asOfDate, asOfDate),
          eq(snapshots.isActive, true),
        ),
      );

    const [snapshot] = await tx
      .insert(snapshots)
      .values({ accountId, documentId, asOfDate, isActive: true })
      .returning();

    if (existingActive) {
      await tx
        .update(snapshots)
        .set({ isActive: false, supersededBySnapshotId: snapshot.id })
        .where(eq(snapshots.id, existingActive.id));
    }

    if (parsed.data.holdings.length > 0) {
      await tx.insert(holdings).values(
        parsed.data.holdings.map((holding, i) => ({
          snapshotId: snapshot.id,
          // Non-null by the caller's contract — see the function doc above.
          assetId: resolvedAssetIds[i]!,
          quantity: holding.quantity,
          value: holding.value,
          currency: holding.currency,
        })),
      );
    }

    await tx.update(documents).set({ status: "committed" }).where(eq(documents.id, documentId));
  });

  return { ok: true };
}

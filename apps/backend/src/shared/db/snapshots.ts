import { and, eq } from "drizzle-orm";
import type { Snapshot } from "@vantage/shared-types";
import { db } from "./client.js";
import { snapshots } from "./schema.js";

// supersededBySnapshotId is `string | null` in the shared type already
// (not optional) — unlike Document's dateRangeStart-style fields, null
// passes through as-is here, no `?? undefined`.
function toSnapshot(row: typeof snapshots.$inferSelect): Snapshot {
  return { ...row };
}

export async function findActiveSnapshot(accountId: string, asOfDate: string) {
  const [row] = await db
    .select()
    .from(snapshots)
    .where(
      and(
        eq(snapshots.accountId, accountId),
        eq(snapshots.asOfDate, asOfDate),
        eq(snapshots.isActive, true),
      ),
    );
  return row && toSnapshot(row);
}

export async function findSnapshotById(id: string) {
  const [row] = await db.select().from(snapshots).where(eq(snapshots.id, id));
  return row && toSnapshot(row);
}

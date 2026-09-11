import { and, desc, eq, inArray, lt } from "drizzle-orm";
import type { Snapshot } from "../../dto/index.js";
import { db } from "./client.js";
import { accountUsers, snapshots } from "./schema.js";

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

// The closest earlier active Snapshot for this Account — see ADR-0023/#39:
// walks the per-date active lineage (a superseded Snapshot only ever
// replaces a same-date correction, ADR-0009, never a different date), used
// to diff Excellence's purchaseCostIls against the previous period.
export async function findPreviousActiveSnapshot(accountId: string, beforeDate: string) {
  const [row] = await db
    .select()
    .from(snapshots)
    .where(
      and(
        eq(snapshots.accountId, accountId),
        lt(snapshots.asOfDate, beforeDate),
        eq(snapshots.isActive, true),
      ),
    )
    .orderBy(desc(snapshots.asOfDate))
    .limit(1);
  return row && toSnapshot(row);
}

export async function findSnapshotById(id: string) {
  const [row] = await db.select().from(snapshots).where(eq(snapshots.id, id));
  return row && toSnapshot(row);
}

// Active-only by default (ADR-0009: superseded Snapshots stay queryable
// for audit but aren't shown as current); includeSuperseded opts into both.
export async function listSnapshotsForUser(
  userId: string,
  options?: { includeSuperseded?: boolean },
) {
  const ownedRows = await db
    .select({ accountId: accountUsers.accountId })
    .from(accountUsers)
    .where(eq(accountUsers.userId, userId));
  const accountIds = ownedRows.map((r) => r.accountId);
  if (accountIds.length === 0) return [];

  const conditions = [inArray(snapshots.accountId, accountIds)];
  if (!options?.includeSuperseded) {
    conditions.push(eq(snapshots.isActive, true));
  }

  const rows = await db
    .select()
    .from(snapshots)
    .where(and(...conditions));
  return rows.map(toSnapshot);
}

// No active/superseded filter — a direct-by-ID lookup works regardless of
// state, same "superseded snapshots stay queryable" requirement as above.
export async function findSnapshotVisibleToUser(snapshotId: string, userId: string) {
  const [row] = await db
    .select({ snapshot: snapshots })
    .from(snapshots)
    .innerJoin(accountUsers, eq(accountUsers.accountId, snapshots.accountId))
    .where(and(eq(snapshots.id, snapshotId), eq(accountUsers.userId, userId)));
  return row && toSnapshot(row.snapshot);
}

// One Snapshot per Account — the active one with the max asOfDate. An
// Account can have several active Snapshots simultaneously (supersede only
// applies within the same Account+date, ADR-0009), so "latest active" is
// not the same as "the only active one" (docs/DOMAIN.md's Portfolio
// definition). Reduced in JS rather than a window-function query — data
// volume at this app's scale doesn't justify the added complexity.
export async function findLatestActiveSnapshotsForUser(userId: string): Promise<Snapshot[]> {
  const active = await listSnapshotsForUser(userId);

  const latestByAccount = new Map<string, Snapshot>();
  for (const snapshot of active) {
    const current = latestByAccount.get(snapshot.accountId);
    if (!current || snapshot.asOfDate > current.asOfDate) {
      latestByAccount.set(snapshot.accountId, snapshot);
    }
  }
  return [...latestByAccount.values()];
}

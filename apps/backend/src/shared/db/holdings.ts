import { eq } from "drizzle-orm";
import type { Holding } from "@vantage/shared-types";
import { db } from "./client.js";
import { holdings } from "./schema.js";

function toHolding(row: typeof holdings.$inferSelect): Holding {
  return { ...row };
}

export async function listHoldingsForSnapshot(snapshotId: string) {
  return (await db.select().from(holdings).where(eq(holdings.snapshotId, snapshotId))).map(
    toHolding,
  );
}

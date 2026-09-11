import { eq } from "drizzle-orm";
import type { Holding } from "../../dto/index.js";
import { db } from "./client.js";
import { holdings } from "./schema.js";

function toHolding(row: typeof holdings.$inferSelect): Holding {
  return { ...row, purchaseCostIls: row.purchaseCostIls ?? undefined };
}

export async function listHoldingsForSnapshot(snapshotId: string) {
  return (await db.select().from(holdings).where(eq(holdings.snapshotId, snapshotId))).map(
    toHolding,
  );
}

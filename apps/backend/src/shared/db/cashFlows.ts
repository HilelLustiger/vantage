import { eq } from "drizzle-orm";
import type { CashFlow, CashFlowSource } from "@vantage/shared-types";
import { db } from "./client.js";
import { cashFlows } from "./schema.js";

// Postgres represents an absent runningBalanceAfter as NULL; CashFlow
// models it as undefined (optional field) — same normalize-at-the-
// boundary pattern as every other db/*.ts module.
function toCashFlow(row: typeof cashFlows.$inferSelect): CashFlow {
  return {
    ...row,
    source: row.source as CashFlowSource,
    runningBalanceAfter: row.runningBalanceAfter ?? undefined,
  };
}

export async function insertCashFlow(input: {
  accountId: string;
  assetId: string;
  documentId: string;
  date: string;
  amount: string;
  currency: string;
  kind: string;
  source: CashFlowSource;
  runningBalanceAfter?: string;
}) {
  const [row] = await db.insert(cashFlows).values(input).returning();
  return toCashFlow(row);
}

// Cross-account per Asset (ADR-0023) — the same Asset held in several
// Accounts is one combined series, not partitioned by account.
export async function findCashFlowsForAsset(assetId: string) {
  return (await db.select().from(cashFlows).where(eq(cashFlows.assetId, assetId))).map(
    toCashFlow,
  );
}

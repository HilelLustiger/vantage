import { and, eq } from "drizzle-orm";
import { db, type DbExecutor } from "../db/client.js";
import { transactions, type TransactionInsert, type TransactionRow } from "../db/schema.js";

export async function listTransactionsForAsset(
  accountId: string,
  assetId: string,
): Promise<TransactionRow[]> {
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), eq(transactions.assetId, assetId)))
    .orderBy(transactions.occurredAt);
}

// Same Asset can be held across multiple Accounts (see services/holdings.ts,
// which aggregates by assetId) — cost basis/XIRR need every Account's
// transactions for it, not just one.
export async function listTransactionsForAssetAllAccounts(
  assetId: string,
): Promise<TransactionRow[]> {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.assetId, assetId))
    .orderBy(transactions.occurredAt);
}

// Every Transaction across every Asset/Account — the Net Worth history
// chart's cost-basis line needs a running total across the whole portfolio,
// not just one Asset.
export async function listAllTransactions(): Promise<TransactionRow[]> {
  return db.select().from(transactions).orderBy(transactions.occurredAt);
}

export async function insertTransaction(
  input: TransactionInsert,
  executor: DbExecutor = db,
): Promise<TransactionRow> {
  const [transaction] = await executor.insert(transactions).values(input).returning();
  return transaction;
}

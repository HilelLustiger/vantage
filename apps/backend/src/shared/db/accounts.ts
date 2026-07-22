import { and, eq, inArray } from "drizzle-orm";
import { db } from "./client.js";
import { accounts, accountUsers } from "./schema.js";

async function getAccountsWithOwners(accountIds: string[]) {
  if (accountIds.length === 0) return [];

  const rows = await db
    .select({ account: accounts, ownerUserId: accountUsers.userId })
    .from(accounts)
    .innerJoin(accountUsers, eq(accountUsers.accountId, accounts.id))
    .where(inArray(accounts.id, accountIds));

  const byId = new Map<
    string,
    { id: string; institutionId: string; name: string; ownerUserIds: string[] }
  >();
  for (const row of rows) {
    const existing = byId.get(row.account.id);
    if (existing) {
      existing.ownerUserIds.push(row.ownerUserId);
    } else {
      byId.set(row.account.id, { ...row.account, ownerUserIds: [row.ownerUserId] });
    }
  }
  return [...byId.values()];
}

export async function createAccountWithOwners(input: {
  institutionId: string;
  name: string;
  ownerUserIds: string[];
}) {
  return db.transaction(async (tx) => {
    const [account] = await tx
      .insert(accounts)
      .values({ institutionId: input.institutionId, name: input.name })
      .returning();
    await tx
      .insert(accountUsers)
      .values(input.ownerUserIds.map((userId) => ({ accountId: account.id, userId })));
    return { ...account, ownerUserIds: input.ownerUserIds };
  });
}

export async function listAccountsForUser(userId: string) {
  const ownedRows = await db
    .select({ accountId: accountUsers.accountId })
    .from(accountUsers)
    .where(eq(accountUsers.userId, userId));

  return getAccountsWithOwners(ownedRows.map((r) => r.accountId));
}

export async function findAccountById(accountId: string) {
  const [account] = await getAccountsWithOwners([accountId]);
  return account;
}

export async function findAccountVisibleToUser(accountId: string, userId: string) {
  const [ownedRow] = await db
    .select({ accountId: accountUsers.accountId })
    .from(accountUsers)
    .where(and(eq(accountUsers.userId, userId), eq(accountUsers.accountId, accountId)));
  if (!ownedRow) return undefined;

  const [account] = await getAccountsWithOwners([accountId]);
  return account;
}

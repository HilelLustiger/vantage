import { eq, inArray } from "drizzle-orm";
import type { Account, CreateAccountInput } from "../dto/index.js";
import { db } from "../db/client.js";
import { accountOwners, accounts, institutions, users, type AccountRow } from "../db/schema.js";
import { createInstitution } from "./institutions.js";

async function hydrate(rows: AccountRow[]): Promise<Account[]> {
  if (rows.length === 0) return [];

  const institutionRows = await db
    .select()
    .from(institutions)
    .where(inArray(institutions.id, [...new Set(rows.map((r) => r.institutionId))]));
  const institutionNameById = new Map(institutionRows.map((i) => [i.id, i.name]));

  const ownerRows = await db
    .select({
      accountId: accountOwners.accountId,
      userId: accountOwners.userId,
      email: users.email,
    })
    .from(accountOwners)
    .innerJoin(users, eq(accountOwners.userId, users.id))
    .where(
      inArray(
        accountOwners.accountId,
        rows.map((r) => r.id),
      ),
    );

  const ownersByAccount = new Map<string, { userId: string; email: string }[]>();
  for (const row of ownerRows) {
    const list = ownersByAccount.get(row.accountId) ?? [];
    list.push({ userId: row.userId, email: row.email });
    ownersByAccount.set(row.accountId, list);
  }

  return rows.map((row) => {
    const owners = ownersByAccount.get(row.id) ?? [];
    return {
      id: row.id,
      name: row.name,
      institutionId: row.institutionId,
      institutionName: institutionNameById.get(row.institutionId) ?? "",
      ownerUserIds: owners.map((o) => o.userId),
      ownerEmails: owners.map((o) => o.email),
    };
  });
}

// Single shared household — every user sees every Account. ownerUserIds
// tracks who's associated with it for display, not a visibility boundary.
export async function listAccounts(): Promise<Account[]> {
  const rows = await db.select().from(accounts);
  return hydrate(rows);
}

export async function findAccountById(id: string): Promise<Account | undefined> {
  const rows = await db.select().from(accounts).where(eq(accounts.id, id));
  const [account] = await hydrate(rows);
  return account;
}

export async function createAccount(input: CreateAccountInput): Promise<Account> {
  const institutionId =
    input.institutionId ?? (await createInstitution(input.newInstitutionName!)).id;

  const [account] = await db
    .insert(accounts)
    .values({ name: input.name, institutionId })
    .returning();

  const ownerUserIds = input.ownerUserIds ?? [];
  if (ownerUserIds.length > 0) {
    await db
      .insert(accountOwners)
      .values(ownerUserIds.map((userId) => ({ accountId: account.id, userId })));
  }

  return (await findAccountById(account.id))!;
}

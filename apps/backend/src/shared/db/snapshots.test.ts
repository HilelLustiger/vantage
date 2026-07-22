import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAccountWithOwners } from "./accounts.js";
import { db } from "./client.js";
import { insertDocument } from "./documents.js";
import { createInstitution } from "./institutions.js";
import { snapshots } from "./schema.js";
import { findActiveSnapshot, findSnapshotById } from "./snapshots.js";
import { createUser } from "./users.js";

async function createTestAccount() {
  const user = await createUser({
    email: `test-${randomUUID()}@example.com`,
    passwordHash: "not-checked-in-these-tests",
  });
  const institution = await createInstitution({ name: `Bank ${randomUUID()}` });
  return createAccountWithOwners({
    institutionId: institution.id,
    name: "Test Account",
    ownerUserIds: [user.id],
  });
}

describe("findActiveSnapshot", () => {
  it("finds the active snapshot for an account+date", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    const [row] = await db
      .insert(snapshots)
      .values({
        accountId: account.id,
        documentId: document.id,
        asOfDate: "2026-03-31",
        isActive: true,
      })
      .returning();

    const found = await findActiveSnapshot(account.id, "2026-03-31");

    expect(found?.id).toBe(row.id);
  });

  it("does not return an inactive snapshot", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    await db.insert(snapshots).values({
      accountId: account.id,
      documentId: document.id,
      asOfDate: "2026-03-31",
      isActive: false,
    });

    await expect(findActiveSnapshot(account.id, "2026-03-31")).resolves.toBeUndefined();
  });
});

describe("findSnapshotById", () => {
  it("finds a snapshot by id", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    const [row] = await db
      .insert(snapshots)
      .values({
        accountId: account.id,
        documentId: document.id,
        asOfDate: "2026-03-31",
        isActive: true,
      })
      .returning();

    const found = await findSnapshotById(row.id);

    expect(found?.accountId).toBe(account.id);
  });
});

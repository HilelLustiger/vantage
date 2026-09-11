import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAccountWithOwners } from "./accounts.js";
import { db } from "./client.js";
import { insertDocument } from "./documents.js";
import { createInstitution } from "./institutions.js";
import { snapshots } from "./schema.js";
import {
  findActiveSnapshot,
  findLatestActiveSnapshotsForUser,
  findPreviousActiveSnapshot,
  findSnapshotById,
  findSnapshotVisibleToUser,
  listSnapshotsForUser,
} from "./snapshots.js";
import { createUser } from "./users.js";

async function createTestUser() {
  return createUser({
    email: `test-${randomUUID()}@example.com`,
    passwordHash: "not-checked-in-these-tests",
  });
}

async function createTestAccountForUser(userId: string) {
  const institution = await createInstitution({ name: `Bank ${randomUUID()}` });
  return createAccountWithOwners({
    institutionId: institution.id,
    name: "Test Account",
    ownerUserIds: [userId],
  });
}

async function createTestAccount() {
  const user = await createTestUser();
  return createTestAccountForUser(user.id);
}

async function createSnapshotRow(
  accountId: string,
  documentId: string,
  options?: { asOfDate?: string; isActive?: boolean },
) {
  const [row] = await db
    .insert(snapshots)
    .values({
      accountId,
      documentId,
      asOfDate: options?.asOfDate ?? "2026-03-31",
      isActive: options?.isActive ?? true,
    })
    .returning();
  return row;
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

describe("findPreviousActiveSnapshot", () => {
  it("returns the closest earlier active snapshot", async () => {
    const account = await createTestAccount();
    const olderDoc = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    const closerDoc = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    await createSnapshotRow(account.id, olderDoc.id, { asOfDate: "2025-06-30" });
    const closer = await createSnapshotRow(account.id, closerDoc.id, { asOfDate: "2025-12-31" });

    const found = await findPreviousActiveSnapshot(account.id, "2026-03-31");

    expect(found?.id).toBe(closer.id);
  });

  it("ignores snapshots on or after the given date", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    await createSnapshotRow(account.id, document.id, { asOfDate: "2026-03-31" });

    await expect(findPreviousActiveSnapshot(account.id, "2026-03-31")).resolves.toBeUndefined();
  });

  it("prefers a later date's active snapshot over an earlier date's superseded one", async () => {
    const account = await createTestAccount();
    const supersededDoc = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    const activeDoc = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    await createSnapshotRow(account.id, supersededDoc.id, {
      asOfDate: "2025-06-30",
      isActive: false,
    });
    const active = await createSnapshotRow(account.id, activeDoc.id, { asOfDate: "2025-12-31" });

    const found = await findPreviousActiveSnapshot(account.id, "2026-03-31");

    expect(found?.id).toBe(active.id);
  });

  it("returns undefined when there is no earlier snapshot at all", async () => {
    const account = await createTestAccount();

    await expect(findPreviousActiveSnapshot(account.id, "2026-03-31")).resolves.toBeUndefined();
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

describe("listSnapshotsForUser", () => {
  it("returns only active snapshots by default", async () => {
    const user = await createTestUser();
    const account = await createTestAccountForUser(user.id);
    const activeDoc = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    const supersededDoc = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    const active = await createSnapshotRow(account.id, activeDoc.id, { isActive: true });
    await createSnapshotRow(account.id, supersededDoc.id, {
      asOfDate: "2025-12-31",
      isActive: false,
    });

    const result = await listSnapshotsForUser(user.id);

    expect(result.map((s) => s.id)).toEqual([active.id]);
  });

  it("includes superseded snapshots when asked", async () => {
    const user = await createTestUser();
    const account = await createTestAccountForUser(user.id);
    const activeDoc = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    const supersededDoc = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    const active = await createSnapshotRow(account.id, activeDoc.id, { isActive: true });
    const superseded = await createSnapshotRow(account.id, supersededDoc.id, {
      asOfDate: "2025-12-31",
      isActive: false,
    });

    const result = await listSnapshotsForUser(user.id, { includeSuperseded: true });

    expect(new Set(result.map((s) => s.id))).toEqual(new Set([active.id, superseded.id]));
  });

  it("does not include another user's snapshots", async () => {
    const user = await createTestUser();
    const otherUser = await createTestUser();
    const otherAccount = await createTestAccountForUser(otherUser.id);
    const document = await insertDocument({ accountId: otherAccount.id, checksum: randomUUID() });
    await createSnapshotRow(otherAccount.id, document.id);

    await expect(listSnapshotsForUser(user.id)).resolves.toEqual([]);
  });
});

describe("findSnapshotVisibleToUser", () => {
  it("finds a snapshot visible to its account's owner", async () => {
    const user = await createTestUser();
    const account = await createTestAccountForUser(user.id);
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    const row = await createSnapshotRow(account.id, document.id);

    const found = await findSnapshotVisibleToUser(row.id, user.id);

    expect(found?.id).toBe(row.id);
  });

  it("finds a superseded snapshot too — audit access isn't state-filtered", async () => {
    const user = await createTestUser();
    const account = await createTestAccountForUser(user.id);
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    const row = await createSnapshotRow(account.id, document.id, { isActive: false });

    const found = await findSnapshotVisibleToUser(row.id, user.id);

    expect(found?.id).toBe(row.id);
  });

  it("returns undefined for another user's snapshot", async () => {
    const owner = await createTestUser();
    const outsider = await createTestUser();
    const account = await createTestAccountForUser(owner.id);
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    const row = await createSnapshotRow(account.id, document.id);

    await expect(findSnapshotVisibleToUser(row.id, outsider.id)).resolves.toBeUndefined();
  });
});

describe("findLatestActiveSnapshotsForUser", () => {
  it("picks the max-asOfDate active snapshot per account", async () => {
    const user = await createTestUser();
    const account = await createTestAccountForUser(user.id);
    const olderDoc = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    const newerDoc = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    await createSnapshotRow(account.id, olderDoc.id, { asOfDate: "2025-12-31" });
    const newer = await createSnapshotRow(account.id, newerDoc.id, { asOfDate: "2026-03-31" });

    const result = await findLatestActiveSnapshotsForUser(user.id);

    expect(result.map((s) => s.id)).toEqual([newer.id]);
  });

  it("ignores superseded snapshots", async () => {
    const user = await createTestUser();
    const account = await createTestAccountForUser(user.id);
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    await createSnapshotRow(account.id, document.id, {
      asOfDate: "2026-06-30",
      isActive: false,
    });

    await expect(findLatestActiveSnapshotsForUser(user.id)).resolves.toEqual([]);
  });

  it("returns one snapshot per account, scoped to the calling user", async () => {
    const user = await createTestUser();
    const accountA = await createTestAccountForUser(user.id);
    const accountB = await createTestAccountForUser(user.id);
    const otherUser = await createTestUser();
    const otherAccount = await createTestAccountForUser(otherUser.id);

    const docA = await insertDocument({ accountId: accountA.id, checksum: randomUUID() });
    const docB = await insertDocument({ accountId: accountB.id, checksum: randomUUID() });
    const otherDoc = await insertDocument({ accountId: otherAccount.id, checksum: randomUUID() });
    const snapshotA = await createSnapshotRow(accountA.id, docA.id);
    const snapshotB = await createSnapshotRow(accountB.id, docB.id);
    await createSnapshotRow(otherAccount.id, otherDoc.id);

    const result = await findLatestActiveSnapshotsForUser(user.id);

    expect(new Set(result.map((s) => s.id))).toEqual(new Set([snapshotA.id, snapshotB.id]));
  });
});

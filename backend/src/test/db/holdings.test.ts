import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAccountWithOwners } from "../../db/accounts.js";
import { createAsset } from "../../db/assets.js";
import { db } from "../../db/client.js";
import { insertDocument } from "../../db/documents.js";
import { listHoldingsForSnapshot } from "../../db/holdings.js";
import { createInstitution } from "../../db/institutions.js";
import { holdings, snapshots } from "../../db/schema.js";
import { createUser } from "../../db/users.js";

async function createTestSnapshot() {
  const user = await createUser({
    email: `test-${randomUUID()}@example.com`,
    passwordHash: "not-checked-in-these-tests",
  });
  const institution = await createInstitution({ name: `Bank ${randomUUID()}` });
  const account = await createAccountWithOwners({
    institutionId: institution.id,
    name: "Test Account",
    ownerUserIds: [user.id],
  });
  const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
  const [snapshot] = await db
    .insert(snapshots)
    .values({
      accountId: account.id,
      documentId: document.id,
      asOfDate: "2026-03-31",
      isActive: true,
    })
    .returning();
  return snapshot;
}

describe("listHoldingsForSnapshot", () => {
  it("lists holdings for a snapshot", async () => {
    const snapshot = await createTestSnapshot();
    const asset = await createAsset({ type: "stock", name: "Example Corp" });
    await db.insert(holdings).values({
      snapshotId: snapshot.id,
      assetId: asset.id,
      quantity: "10",
      value: "1000",
      currency: "ILS",
    });

    const result = await listHoldingsForSnapshot(snapshot.id);

    expect(result).toEqual([
      {
        id: expect.any(String),
        snapshotId: snapshot.id,
        assetId: asset.id,
        quantity: "10",
        value: "1000",
        currency: "ILS",
      },
    ]);
  });

  it("returns an empty array for a snapshot with no holdings", async () => {
    const snapshot = await createTestSnapshot();

    await expect(listHoldingsForSnapshot(snapshot.id)).resolves.toEqual([]);
  });
});

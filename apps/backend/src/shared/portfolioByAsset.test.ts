import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAccountWithOwners } from "./db/accounts.js";
import { createAsset } from "./db/assets.js";
import { insertDocument } from "./db/documents.js";
import { createInstitution } from "./db/institutions.js";
import { createUser } from "./db/users.js";
import { transitionDocument } from "../ingest/documents.js";
import { commitSnapshot } from "../ingest/snapshotCreation.js";
import { computePortfolioByAsset } from "./portfolioByAsset.js";

async function createTestUserAndAccount(name = "Test Account") {
  const user = await createUser({
    email: `test-${randomUUID()}@example.com`,
    passwordHash: "not-checked-in-these-tests",
  });
  const institution = await createInstitution({ name: `Bank ${randomUUID()}` });
  const account = await createAccountWithOwners({
    institutionId: institution.id,
    name,
    ownerUserIds: [user.id],
  });
  return { user, account };
}

async function commitTestSnapshot(
  accountId: string,
  holdings: { assetName: string; quantity: string; value: string; currency: string }[],
  assetIds: string[],
) {
  const document = await insertDocument({ accountId, checksum: randomUUID() });
  await transitionDocument(document.id, "processing");
  const result = await commitSnapshot(
    document.id,
    accountId,
    { asOfDate: "31.01.2026", holdings },
    assetIds,
  );
  if (!result.ok) throw new Error(`fixture commit failed: ${result.reason}`);
}

describe("computePortfolioByAsset", () => {
  it("returns an empty list when nothing is held", async () => {
    const { user } = await createTestUserAndAccount();

    await expect(computePortfolioByAsset(user.id)).resolves.toEqual([]);
  });

  it("sums quantity across accounts and currencies, keeping value split by currency", async () => {
    const { user, account: accountA } = await createTestUserAndAccount("Account A");
    const institution = await createInstitution({ name: `Bank ${randomUUID()}` });
    const accountB = await createAccountWithOwners({
      institutionId: institution.id,
      name: "Account B",
      ownerUserIds: [user.id],
    });
    const asset = await createAsset({ type: "stock", name: `Asset ${randomUUID()}` });

    await commitTestSnapshot(
      accountA.id,
      [{ assetName: asset.name, quantity: "10", value: "1000", currency: "ILS" }],
      [asset.id],
    );
    await commitTestSnapshot(
      accountB.id,
      [{ assetName: asset.name, quantity: "5", value: "500", currency: "USD" }],
      [asset.id],
    );

    const result = await computePortfolioByAsset(user.id);

    expect(result).toHaveLength(1);
    expect(result[0].assetId).toBe(asset.id);
    expect(result[0].quantity).toBe("15");
    expect(new Set(result[0].valuesByCurrency)).toEqual(
      new Set([
        { currency: "ILS", value: "1000" },
        { currency: "USD", value: "500" },
      ]),
    );
  });

  it("keeps distinct assets as separate entries", async () => {
    const { user, account } = await createTestUserAndAccount();
    const assetA = await createAsset({ type: "stock", name: `Asset A ${randomUUID()}` });
    const assetB = await createAsset({ type: "stock", name: `Asset B ${randomUUID()}` });

    await commitTestSnapshot(
      account.id,
      [
        { assetName: assetA.name, quantity: "10", value: "1000", currency: "ILS" },
        { assetName: assetB.name, quantity: "2", value: "200", currency: "ILS" },
      ],
      [assetA.id, assetB.id],
    );

    const result = await computePortfolioByAsset(user.id);

    expect(new Set(result.map((r) => r.assetId))).toEqual(new Set([assetA.id, assetB.id]));
  });

  it("makes no FX/network calls at all", async () => {
    const { user, account } = await createTestUserAndAccount();
    const asset = await createAsset({ type: "stock", name: `Asset ${randomUUID()}` });
    await commitTestSnapshot(
      account.id,
      [{ assetName: asset.name, quantity: "1", value: "1", currency: "USD" }],
      [asset.id],
    );

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await computePortfolioByAsset(user.id);

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

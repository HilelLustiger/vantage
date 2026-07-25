import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAccountWithOwners } from "./db/accounts.js";
import { createAsset } from "./db/assets.js";
import { insertCashFlow } from "./db/cashFlows.js";
import { insertDocument } from "./db/documents.js";
import { createInstitution } from "./db/institutions.js";
import { createUser } from "./db/users.js";
import { transitionDocument } from "../ingest/documents.js";
import { commitSnapshot } from "../ingest/snapshotCreation.js";
import { computeAssetCostBasisMetrics } from "./assetCostBasis.js";

// TAX_RATE must be set for this module to even load — passed via the shell
// for host-side test runs (DATABASE_URL/SESSION_SECRET follow the same
// established pattern in this repo).

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
  holdings: {
    assetName: string;
    quantity: string;
    value: string;
    currency: string;
    purchaseCostIls?: number;
  }[],
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

describe("computeAssetCostBasisMetrics", () => {
  it("returns an empty list when nothing is held", async () => {
    const { user } = await createTestUserAndAccount();

    await expect(computeAssetCostBasisMetrics(user.id)).resolves.toEqual([]);
  });

  it("prefers the institution-stated purchaseCostIls when every current holding has one", async () => {
    const { user, account } = await createTestUserAndAccount();
    const asset = await createAsset({ type: "etf", name: `Asset ${randomUUID()}` });
    await commitTestSnapshot(
      account.id,
      [
        {
          assetName: asset.name,
          quantity: "4",
          value: "16720",
          currency: "ILS",
          purchaseCostIls: 16359.52,
        },
      ],
      [asset.id],
    );

    const result = await computeAssetCostBasisMetrics(user.id);

    expect(result).toEqual([
      {
        assetId: asset.id,
        currency: "ILS",
        currentValue: "16720",
        costBasis: "16359.52",
        costBasisSource: "institution_stated",
        profit: "360.48",
        taxOnProfit: "90.12", // 360.48 * 0.25, TAX_RATE from the test env
        netOfTax: "16629.88",
      },
    ]);
  });

  it("falls back to summing cash_flows when no current holding has a purchaseCostIls", async () => {
    const { user, account } = await createTestUserAndAccount();
    const asset = await createAsset({ type: "stock", name: `Asset ${randomUUID()}` });
    await commitTestSnapshot(
      account.id,
      [{ assetName: asset.name, quantity: "10", value: "1200", currency: "ILS" }],
      [asset.id],
    );
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    await insertCashFlow({
      accountId: account.id,
      assetId: asset.id,
      documentId: document.id,
      date: "2025-01-01",
      amount: "1000",
      currency: "ILS",
      kind: "buy",
      source: "ingested_transaction",
    });

    const result = await computeAssetCostBasisMetrics(user.id);

    expect(result).toEqual([
      expect.objectContaining({
        costBasis: "1000",
        costBasisSource: "derived_from_cash_flows",
        profit: "200",
      }),
    ]);
  });

  it("falls back entirely when only some current holdings have a purchaseCostIls (no mixing)", async () => {
    const { user, account: accountA } = await createTestUserAndAccount("Account A");
    const institution = await createInstitution({ name: `Bank ${randomUUID()}` });
    const accountB = await createAccountWithOwners({
      institutionId: institution.id,
      name: "Account B",
      ownerUserIds: [user.id],
    });
    const asset = await createAsset({ type: "etf", name: `Asset ${randomUUID()}` });
    await commitTestSnapshot(
      accountA.id,
      [
        {
          assetName: asset.name,
          quantity: "4",
          value: "1000",
          currency: "ILS",
          purchaseCostIls: 800,
        },
      ],
      [asset.id],
    );
    await commitTestSnapshot(
      accountB.id,
      [{ assetName: asset.name, quantity: "2", value: "500", currency: "ILS" }],
      [asset.id],
    );
    const document = await insertDocument({ accountId: accountA.id, checksum: randomUUID() });
    await insertCashFlow({
      accountId: accountA.id,
      assetId: asset.id,
      documentId: document.id,
      date: "2025-01-01",
      amount: "1100",
      currency: "ILS",
      kind: "buy",
      source: "ingested_transaction",
    });

    const result = await computeAssetCostBasisMetrics(user.id);

    expect(result).toEqual([
      expect.objectContaining({
        currentValue: "1500",
        costBasis: "1100", // the cash_flows sum, NOT 800 (partial institution data ignored)
        costBasisSource: "derived_from_cash_flows",
      }),
    ]);
  });

  it("resolves costBasis to 0 (profit == currentValue) when there is no cash-flow history at all", async () => {
    const { user, account } = await createTestUserAndAccount();
    const asset = await createAsset({ type: "stock", name: `Asset ${randomUUID()}` });
    await commitTestSnapshot(
      account.id,
      [{ assetName: asset.name, quantity: "1", value: "500", currency: "ILS" }],
      [asset.id],
    );

    const result = await computeAssetCostBasisMetrics(user.id);

    expect(result).toEqual([
      expect.objectContaining({
        costBasis: "0",
        costBasisSource: "derived_from_cash_flows",
        profit: "500",
      }),
    ]);
  });

  it("never produces a negative taxOnProfit for a loss", async () => {
    const { user, account } = await createTestUserAndAccount();
    const asset = await createAsset({ type: "etf", name: `Asset ${randomUUID()}` });
    await commitTestSnapshot(
      account.id,
      [
        {
          assetName: asset.name,
          quantity: "1",
          value: "500",
          currency: "ILS",
          purchaseCostIls: 800,
        },
      ],
      [asset.id],
    );

    const result = await computeAssetCostBasisMetrics(user.id);

    expect(result).toEqual([
      expect.objectContaining({
        profit: "-300",
        taxOnProfit: "0",
        netOfTax: "500",
      }),
    ]);
  });

  it("resolves the same Asset held in two currencies as two independent entries", async () => {
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
      [
        {
          assetName: asset.name,
          quantity: "1",
          value: "1000",
          currency: "ILS",
          purchaseCostIls: 900,
        },
      ],
      [asset.id],
    );
    await commitTestSnapshot(
      accountB.id,
      [
        {
          assetName: asset.name,
          quantity: "1",
          value: "300",
          currency: "USD",
          purchaseCostIls: 250,
        },
      ],
      [asset.id],
    );

    const result = await computeAssetCostBasisMetrics(user.id);

    expect(result).toHaveLength(2);
    expect(new Set(result.map((r) => `${r.currency}:${r.profit}`))).toEqual(
      new Set(["ILS:100", "USD:50"]),
    );
  });
});

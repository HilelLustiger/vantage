import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAccountWithOwners } from "./accounts.js";
import { createAsset } from "./assets.js";
import { findCashFlowsForAsset, insertCashFlow } from "./cashFlows.js";
import { insertDocument } from "./documents.js";
import { createInstitution } from "./institutions.js";
import { createUser } from "./users.js";

async function createTestAccount(name = "Test Account") {
  const user = await createUser({
    email: `test-${randomUUID()}@example.com`,
    passwordHash: "not-checked-in-these-tests",
  });
  const institution = await createInstitution({ name: `Bank ${randomUUID()}` });
  return createAccountWithOwners({
    institutionId: institution.id,
    name,
    ownerUserIds: [user.id],
  });
}

async function createTestDocument(accountId: string) {
  return insertDocument({ accountId, checksum: randomUUID() });
}

describe("insertCashFlow / findCashFlowsForAsset", () => {
  it("round-trips a cash flow", async () => {
    const account = await createTestAccount();
    const asset = await createAsset({ type: "stock", name: `Asset ${randomUUID()}` });
    const document = await createTestDocument(account.id);

    const inserted = await insertCashFlow({
      accountId: account.id,
      assetId: asset.id,
      documentId: document.id,
      date: "2026-03-31",
      amount: "1000",
      currency: "ILS",
      kind: "buy",
      source: "ingested_transaction",
      runningBalanceAfter: "5000",
    });

    expect(inserted).toEqual({
      id: expect.any(String),
      accountId: account.id,
      assetId: asset.id,
      documentId: document.id,
      date: "2026-03-31",
      amount: "1000",
      currency: "ILS",
      kind: "buy",
      source: "ingested_transaction",
      runningBalanceAfter: "5000",
    });

    const found = await findCashFlowsForAsset(asset.id);
    expect(found).toEqual([inserted]);
  });

  it("leaves runningBalanceAfter undefined, not null, when omitted", async () => {
    const account = await createTestAccount();
    const asset = await createAsset({ type: "stock", name: `Asset ${randomUUID()}` });
    const document = await createTestDocument(account.id);

    const inserted = await insertCashFlow({
      accountId: account.id,
      assetId: asset.id,
      documentId: document.id,
      date: "2026-03-31",
      amount: "-200",
      currency: "ILS",
      kind: "period_net_flow",
      source: "derived_period_aggregate",
    });

    expect(inserted.runningBalanceAfter).toBeUndefined();
  });

  it("combines flows from multiple Accounts for the same Asset", async () => {
    const accountA = await createTestAccount("Account A");
    const accountB = await createTestAccount("Account B");
    const asset = await createAsset({ type: "stock", name: `Asset ${randomUUID()}` });
    const documentA = await createTestDocument(accountA.id);
    const documentB = await createTestDocument(accountB.id);

    await insertCashFlow({
      accountId: accountA.id,
      assetId: asset.id,
      documentId: documentA.id,
      date: "2026-01-01",
      amount: "100",
      currency: "ILS",
      kind: "buy",
      source: "ingested_transaction",
    });
    await insertCashFlow({
      accountId: accountB.id,
      assetId: asset.id,
      documentId: documentB.id,
      date: "2026-02-01",
      amount: "50",
      currency: "ILS",
      kind: "buy",
      source: "ingested_transaction",
    });

    const found = await findCashFlowsForAsset(asset.id);

    expect(new Set(found.map((f) => f.accountId))).toEqual(new Set([accountA.id, accountB.id]));
  });

  it("returns an empty array when the Asset has no cash flows", async () => {
    const asset = await createAsset({ type: "stock", name: `Asset ${randomUUID()}` });

    await expect(findCashFlowsForAsset(asset.id)).resolves.toEqual([]);
  });
});

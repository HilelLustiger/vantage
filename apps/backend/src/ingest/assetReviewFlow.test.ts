import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAccountWithOwners } from "../shared/db/accounts.js";
import { createAsset, findAssetsByTicker } from "../shared/db/assets.js";
import { findDocumentById, insertDocument } from "../shared/db/documents.js";
import { createInstitution } from "../shared/db/institutions.js";
import { createUser } from "../shared/db/users.js";
import { applyResolutions, buildReviewLines } from "./assetReviewFlow.js";
import { transitionDocument, transitionDocumentToNeedsReview } from "./documents.js";

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

async function createNeedsReviewDocument(accountId: string, resolvedHoldings: (string | null)[]) {
  const document = await insertDocument({ accountId, checksum: randomUUID() });
  await transitionDocument(document.id, "processing");
  await transitionDocumentToNeedsReview(document.id, resolvedHoldings);
  return document;
}

const parsedData = {
  asOfDate: "31.03.2026",
  holdings: [
    { assetName: "Already Matched Fund", quantity: "5", value: "500", currency: "ILS" },
    { assetName: "Unrecognized Fund", quantity: "10", value: "1000", currency: "ILS" },
  ],
};

describe("buildReviewLines", () => {
  it("zips parsedData holdings with resolvedHoldings by index", () => {
    const matchedAssetId = randomUUID();
    const lines = buildReviewLines(parsedData, [matchedAssetId, null]);

    expect(lines).toEqual([
      {
        index: 0,
        assetName: "Already Matched Fund",
        quantity: "5",
        value: "500",
        currency: "ILS",
        resolvedAssetId: matchedAssetId,
      },
      {
        index: 1,
        assetName: "Unrecognized Fund",
        quantity: "10",
        value: "1000",
        currency: "ILS",
      },
    ]);
  });

  it("returns null when parsedData does not validate", () => {
    expect(buildReviewLines({ notHoldings: true }, null)).toBeNull();
  });
});

describe("applyResolutions", () => {
  it("resolves a line by matching an existing asset", async () => {
    const account = await createTestAccount();
    const alreadyMatched = await createAsset({ type: "stock", name: "Already Matched Fund" });
    const asset = await createAsset({ type: "stock", name: "Existing Corp" });
    const document = await createNeedsReviewDocument(account.id, [alreadyMatched.id, null]);

    const result = await applyResolutions(
      document.id,
      account.id,
      parsedData,
      [alreadyMatched.id, null],
      [{ index: 1, assetId: asset.id }],
    );

    expect(result).toEqual({ ok: true });
    expect((await findDocumentById(document.id))?.status).toBe("committed");
  });

  it("resolves a line by creating a new asset", async () => {
    const account = await createTestAccount();
    const alreadyMatched = await createAsset({ type: "stock", name: "Already Matched Fund" });
    const document = await createNeedsReviewDocument(account.id, [alreadyMatched.id, null]);
    const ticker = `TICK-${randomUUID()}`;

    const result = await applyResolutions(
      document.id,
      account.id,
      parsedData,
      [alreadyMatched.id, null],
      [{ index: 1, newAsset: { type: "stock", name: "Brand New Fund", ticker } }],
    );

    expect(result).toEqual({ ok: true });
    expect((await findDocumentById(document.id))?.status).toBe("committed");
    await expect(findAssetsByTicker(ticker)).resolves.toHaveLength(1);
  });

  it("rejects an out-of-range index without creating anything", async () => {
    const account = await createTestAccount();
    const document = await createNeedsReviewDocument(account.id, [null, null]);

    const result = await applyResolutions(document.id, account.id, parsedData, [null, null], [
      { index: 5, assetId: "does-not-matter" },
    ]);

    expect(result).toEqual({
      ok: false,
      kind: "invalid_request",
      reason: "line 5 does not exist",
    });
    expect((await findDocumentById(document.id))?.status).toBe("needs_review");
  });

  it("rejects a resolution for an already-resolved line", async () => {
    const account = await createTestAccount();
    const matchedAssetId = randomUUID();
    const document = await createNeedsReviewDocument(account.id, [matchedAssetId, null]);

    const result = await applyResolutions(document.id, account.id, parsedData, [matchedAssetId, null], [
      { index: 0, assetId: matchedAssetId },
      { index: 1, assetId: matchedAssetId },
    ]);

    expect(result).toEqual({
      ok: false,
      kind: "invalid_request",
      reason: "line 0 is already resolved",
    });
  });

  it("rejects a duplicate target index", async () => {
    const account = await createTestAccount();
    const asset = await createAsset({ type: "stock", name: "Existing Corp" });
    const document = await createNeedsReviewDocument(account.id, [null, null]);

    const result = await applyResolutions(document.id, account.id, parsedData, [null, null], [
      { index: 1, assetId: asset.id },
      { index: 1, assetId: asset.id },
    ]);

    expect(result).toEqual({
      ok: false,
      kind: "invalid_request",
      reason: "line 1 was resolved more than once",
    });
  });

  it("rejects a reference to a nonexistent asset", async () => {
    const account = await createTestAccount();
    const document = await createNeedsReviewDocument(account.id, [null, null]);

    const result = await applyResolutions(document.id, account.id, parsedData, [null, null], [
      { index: 0, assetId: randomUUID() },
      { index: 1, assetId: randomUUID() },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("invalid_request");
      expect(result.reason).toContain("not found");
    }
  });

  it("rejects an incomplete batch that leaves an unmatched line uncovered", async () => {
    const account = await createTestAccount();
    const asset = await createAsset({ type: "stock", name: "Existing Corp" });
    const document = await createNeedsReviewDocument(account.id, [null, null]);

    const result = await applyResolutions(document.id, account.id, parsedData, [null, null], [
      { index: 0, assetId: asset.id },
    ]);

    expect(result).toEqual({
      ok: false,
      kind: "invalid_request",
      reason: "every unmatched line must be resolved (missing: 1)",
    });
    expect((await findDocumentById(document.id))?.status).toBe("needs_review");
  });

  it("surfaces a downstream commit failure as commit_failed", async () => {
    const account = await createTestAccount();
    const asset = await createAsset({ type: "stock", name: "Existing Corp" });
    const document = await createNeedsReviewDocument(account.id, [null]);
    const badDateData = { asOfDate: "not a real date", holdings: [parsedData.holdings[1]] };

    const result = await applyResolutions(document.id, account.id, badDateData, [null], [
      { index: 0, assetId: asset.id },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("commit_failed");
    }
  });
});

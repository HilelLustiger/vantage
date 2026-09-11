import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAccountWithOwners } from "../../db/accounts.js";
import { createAsset } from "../../db/assets.js";
import { insertDocument } from "../../db/documents.js";
import { createInstitution } from "../../db/institutions.js";
import { createUser } from "../../db/users.js";
import { transitionDocument } from "../../ingest/documents.js";
import { commitSnapshot } from "../../ingest/snapshotCreation.js";
import { computePortfolioHistory } from "../../domain/portfolioHistory.js";

async function createTestUserAndAccount() {
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
  return { user, account };
}

async function commitTestSnapshot(
  accountId: string,
  asOfDate: string,
  holdings: { assetName: string; quantity: string; value: string; currency: string }[],
  assetIds: string[],
) {
  const document = await insertDocument({ accountId, checksum: randomUUID() });
  await transitionDocument(document.id, "processing");
  const result = await commitSnapshot(document.id, accountId, { asOfDate, holdings }, assetIds);
  if (!result.ok) throw new Error(`fixture commit failed: ${result.reason}`);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("computePortfolioHistory", () => {
  it("returns an empty array when the user has no Snapshots", async () => {
    const { user } = await createTestUserAndAccount();

    await expect(computePortfolioHistory(user.id, "ILS")).resolves.toEqual([]);
  });

  it("emits one point per distinct event date, carrying forward each account's latest snapshot", async () => {
    const { user, account: accountA } = await createTestUserAndAccount();
    const institution = await createInstitution({ name: `Bank ${randomUUID()}` });
    const accountB = await createAccountWithOwners({
      institutionId: institution.id,
      name: "Second Account",
      ownerUserIds: [user.id],
    });
    const asset = await createAsset({ type: "stock", name: `Asset ${randomUUID()}` });

    await commitTestSnapshot(
      accountA.id,
      "31.01.2026",
      [{ assetName: asset.name, quantity: "10", value: "100", currency: "ILS" }],
      [asset.id],
    );
    await commitTestSnapshot(
      accountB.id,
      "28.02.2026",
      [{ assetName: asset.name, quantity: "5", value: "50", currency: "ILS" }],
      [asset.id],
    );

    const points = await computePortfolioHistory(user.id, "ILS");

    expect(points).toEqual([
      { date: "2026-01-31", value: "100", costBasis: "0" },
      // Account A's Snapshot carries forward into this later event date.
      { date: "2026-02-28", value: "150", costBasis: "0" },
    ]);
  });

  it("converts each point using that point's own date's rate, not the carried-forward snapshot's date", async () => {
    const { user, account: accountA } = await createTestUserAndAccount();
    const institution = await createInstitution({ name: `Bank ${randomUUID()}` });
    const accountB = await createAccountWithOwners({
      institutionId: institution.id,
      name: "Second Account",
      ownerUserIds: [user.id],
    });
    const asset = await createAsset({ type: "stock", name: `Asset ${randomUUID()}` });

    await commitTestSnapshot(
      accountA.id,
      "01.01.2026",
      [{ assetName: asset.name, quantity: "1", value: "100", currency: "USD" }],
      [asset.id],
    );
    // No holdings — exists purely to create a second event date so
    // Account A's USD holding gets carried forward and re-converted.
    await commitTestSnapshot(accountB.id, "01.02.2026", [], []);

    const fetchMock = vi.fn(async (url: string) => {
      const rate = url.includes("2026-01-01") ? 3 : 4;
      return new Response(
        JSON.stringify({ amount: 1, base: "USD", date: url, rates: { ILS: rate } }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const points = await computePortfolioHistory(user.id, "ILS");

    expect(points).toEqual([
      { date: "2026-01-01", value: "300", costBasis: "0" }, // 100 USD * rate 3 (as of 2026-01-01)
      { date: "2026-02-01", value: "400", costBasis: "0" }, // same USD holding, carried forward, rate 4 (as of 2026-02-01)
    ]);
  });
});

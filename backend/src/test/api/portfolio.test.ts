import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { hashPassword } from "../../api/password.js";
import { createAccountWithOwners } from "../../db/accounts.js";
import { createAsset } from "../../db/assets.js";
import { createInstitution } from "../../db/institutions.js";
import { createUser } from "../../db/users.js";
import { insertDocument } from "../../db/documents.js";
import { transitionDocument } from "../../ingest/documents.js";
import { commitSnapshot } from "../../ingest/snapshotCreation.js";

async function loginAsNewUser(app: ReturnType<typeof createApp>) {
  const email = `test-${randomUUID()}@example.com`;
  const password = "correct-horse-battery-staple";
  const user = await createUser({ email, passwordHash: await hashPassword(password) });
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password }).expect(200);
  return { agent, userId: user.id };
}

async function createTestAccount(userId: string) {
  const institution = await createInstitution({ name: `Bank ${randomUUID()}` });
  return createAccountWithOwners({
    institutionId: institution.id,
    name: "Test Account",
    ownerUserIds: [userId],
  });
}

describe("GET /api/portfolio/by-asset", () => {
  it("merges quantity/value with #40/#41/#42's cost-basis/return metrics", async () => {
    const app = createApp();
    const { agent, userId } = await loginAsNewUser(app);
    const account = await createTestAccount(userId);
    const asset = await createAsset({ type: "etf", name: `Asset ${randomUUID()}` });

    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    await transitionDocument(document.id, "processing");
    const commitResult = await commitSnapshot(
      document.id,
      account.id,
      {
        asOfDate: "31.01.2026",
        holdings: [
          {
            assetName: asset.name,
            quantity: "4",
            value: "16720",
            currency: "ILS",
            purchaseCostIls: 16359.52,
          },
        ],
      },
      [asset.id],
    );
    expect(commitResult).toEqual({ ok: true });

    const res = await agent.get("/api/portfolio/by-asset").expect(200);

    expect(res.body).toEqual({
      userId,
      assets: [
        {
          assetId: asset.id,
          quantity: "4",
          valuesByCurrency: [
            {
              currency: "ILS",
              value: "16720",
              costBasis: "16359.52",
              costBasisSource: "institution_stated",
              profit: "360.48",
              simpleReturnPct: 2.2,
              xirr: null,
              taxOnProfit: "90.12",
              netOfTax: "16629.88",
              // TODO(#59): stubbed as "today, open" until real freshness/
              // closed-position detection exists — see backend/src/api/portfolio.ts.
              freshness: { kind: "document", asOfDate: expect.any(String), daysSinceStatement: 0 },
              status: "open",
            },
          ],
        },
      ],
    });
  });

  it("401s for an unauthenticated request", async () => {
    const app = createApp();

    await request(app).get("/api/portfolio/by-asset").expect(401);
  });
});

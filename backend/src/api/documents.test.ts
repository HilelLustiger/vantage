import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { hashPassword } from "./password.js";
import { createAccountWithOwners } from "../shared/db/accounts.js";
import { createAsset } from "../shared/db/assets.js";
import { insertDocument } from "../shared/db/documents.js";
import { createInstitution } from "../shared/db/institutions.js";
import { createUser } from "../shared/db/users.js";
import {
  storeParsedData,
  transitionDocument,
  transitionDocumentToNeedsReview,
} from "../ingest/documents.js";

const parsedData = {
  asOfDate: "31.03.2026",
  holdings: [{ assetName: "Unrecognized Fund", quantity: "10", value: "1000", currency: "ILS" }],
};

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

async function createNeedsReviewDocument(accountId: string) {
  const document = await insertDocument({ accountId, checksum: randomUUID() });
  await transitionDocument(document.id, "processing");
  await storeParsedData(document.id, parsedData);
  await transitionDocumentToNeedsReview(document.id, [null]);
  return document;
}

describe("GET /api/documents/:id/review", () => {
  it("returns the review lines for a needs_review document", async () => {
    const app = createApp();
    const { agent, userId } = await loginAsNewUser(app);
    const account = await createTestAccount(userId);
    const document = await createNeedsReviewDocument(account.id);

    const res = await agent.get(`/api/documents/${document.id}/review`).expect(200);

    expect(res.body).toEqual({
      documentId: document.id,
      lines: [
        {
          index: 0,
          assetName: "Unrecognized Fund",
          quantity: "10",
          value: "1000",
          currency: "ILS",
        },
      ],
    });
  });

  it("404s for another user's document", async () => {
    const app = createApp();
    const { userId } = await loginAsNewUser(app);
    const account = await createTestAccount(userId);
    const document = await createNeedsReviewDocument(account.id);
    const { agent: outsider } = await loginAsNewUser(app);

    await outsider.get(`/api/documents/${document.id}/review`).expect(404);
  });

  it("404s for a document that isn't needs_review", async () => {
    const app = createApp();
    const { agent, userId } = await loginAsNewUser(app);
    const account = await createTestAccount(userId);
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });

    await agent.get(`/api/documents/${document.id}/review`).expect(404);
  });
});

describe("POST /api/documents/:id/resolve", () => {
  it("commits the document when every unmatched line is resolved by matching an existing asset", async () => {
    const app = createApp();
    const { agent, userId } = await loginAsNewUser(app);
    const account = await createTestAccount(userId);
    const document = await createNeedsReviewDocument(account.id);
    const asset = await createAsset({ type: "stock", name: "Existing Corp" });

    const res = await agent
      .post(`/api/documents/${document.id}/resolve`)
      .send({ resolutions: [{ index: 0, assetId: asset.id }] })
      .expect(200);

    expect(res.body.status).toBe("committed");
  });

  it("commits the document when a line is resolved by creating a new asset", async () => {
    const app = createApp();
    const { agent, userId } = await loginAsNewUser(app);
    const account = await createTestAccount(userId);
    const document = await createNeedsReviewDocument(account.id);

    const res = await agent
      .post(`/api/documents/${document.id}/resolve`)
      .send({ resolutions: [{ index: 0, newAsset: { type: "stock", name: "Brand New Fund" } }] })
      .expect(200);

    expect(res.body.status).toBe("committed");
  });

  it("leaves the document in needs_review on an invalid resolution", async () => {
    const app = createApp();
    const { agent, userId } = await loginAsNewUser(app);
    const account = await createTestAccount(userId);
    const document = await createNeedsReviewDocument(account.id);

    await agent
      .post(`/api/documents/${document.id}/resolve`)
      .send({ resolutions: [{ index: 99, assetId: randomUUID() }] })
      .expect(400);

    const check = await agent.get(`/api/documents/${document.id}`).expect(200);
    expect(check.body.status).toBe("needs_review");
  });

  it("404s for another user's document", async () => {
    const app = createApp();
    const { userId } = await loginAsNewUser(app);
    const account = await createTestAccount(userId);
    const document = await createNeedsReviewDocument(account.id);
    const { agent: outsider } = await loginAsNewUser(app);

    await outsider
      .post(`/api/documents/${document.id}/resolve`)
      .send({ resolutions: [{ index: 0, assetId: randomUUID() }] })
      .expect(404);
  });

  it("rejects an empty resolutions array", async () => {
    const app = createApp();
    const { agent, userId } = await loginAsNewUser(app);
    const account = await createTestAccount(userId);
    const document = await createNeedsReviewDocument(account.id);

    await agent.post(`/api/documents/${document.id}/resolve`).send({ resolutions: [] }).expect(400);
  });
});

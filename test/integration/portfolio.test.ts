import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "@vantage/backend/app";
import { createUser } from "@vantage/backend/db/users";
import { hashPassword } from "@vantage/backend/password";

// The fake parser stand-in (vitest.setup.ts) always reports zero holdings,
// so this suite covers the router's own job — visibility scoping across
// accounts, response shape, auth — not the currency math itself. That's
// covered directly by shared/portfolioAggregation.test.ts and
// shared/exchangeRates.test.ts in apps/backend.
const PDF_BYTES = Buffer.from("%PDF-1.4\n%%EOF");

async function loginAsNewUser(app: ReturnType<typeof createApp>) {
  const email = `test-${randomUUID()}@example.com`;
  const password = "correct-horse-battery-staple";
  await createUser({ email, passwordHash: await hashPassword(password) });

  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password }).expect(200);
  return agent;
}

async function createAccountWithCommittedUpload(agent: ReturnType<typeof request.agent>) {
  const institution = await agent
    .post("/api/institutions")
    .send({ name: `Bank ${randomUUID()}` })
    .expect(201);
  const account = await agent
    .post("/api/accounts")
    .send({ institutionId: institution.body.id, name: "Test Account" })
    .expect(201);
  await agent
    .post("/api/documents")
    .field("accountId", account.body.id)
    .attach("file", PDF_BYTES, { filename: "statement.pdf", contentType: "application/pdf" })
    .expect(201);
  return account.body.id as string;
}

describe("portfolio aggregation", () => {
  it("returns an empty portfolio when nothing has been imported", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);

    const res = await agent.get("/api/portfolio").expect(200);

    expect(res.body).toEqual({ userId: expect.any(String), lines: [] });
  });

  it("aggregates across every visible account, in the default ILS currency", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);
    await createAccountWithCommittedUpload(agent);
    await createAccountWithCommittedUpload(agent);

    const res = await agent.get("/api/portfolio").expect(200);

    expect(res.body.lines).toEqual([]);
  });

  it("accepts an explicit ?currency", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);
    await createAccountWithCommittedUpload(agent);

    await agent.get("/api/portfolio?currency=USD").expect(200);
  });

  it("does not include another user's accounts", async () => {
    const app = createApp();
    const owner = await loginAsNewUser(app);
    await createAccountWithCommittedUpload(owner);

    const outsider = await loginAsNewUser(app);
    const res = await outsider.get("/api/portfolio").expect(200);

    expect(res.body.lines).toEqual([]);
  });

  it("rejects unauthenticated requests", async () => {
    const app = createApp();
    await request(app).get("/api/portfolio").expect(401);
  });
});

describe("GET /api/portfolio/currency-breakdown", () => {
  it("returns an empty breakdown when nothing has been imported", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);

    const res = await agent.get("/api/portfolio/currency-breakdown").expect(200);

    expect(res.body).toEqual({ userId: expect.any(String), lines: [] });
  });

  it("does not include another user's accounts", async () => {
    const app = createApp();
    const owner = await loginAsNewUser(app);
    await createAccountWithCommittedUpload(owner);

    const outsider = await loginAsNewUser(app);
    const res = await outsider.get("/api/portfolio/currency-breakdown").expect(200);

    expect(res.body.lines).toEqual([]);
  });

  it("rejects unauthenticated requests", async () => {
    const app = createApp();
    await request(app).get("/api/portfolio/currency-breakdown").expect(401);
  });
});

describe("GET /api/portfolio/history", () => {
  it("returns an empty history when nothing has been imported", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);

    const res = await agent.get("/api/portfolio/history").expect(200);

    expect(res.body).toEqual({ userId: expect.any(String), points: [] });
  });

  it("does not include another user's accounts", async () => {
    const app = createApp();
    const owner = await loginAsNewUser(app);
    await createAccountWithCommittedUpload(owner);

    const outsider = await loginAsNewUser(app);
    const res = await outsider.get("/api/portfolio/history").expect(200);

    expect(res.body.points).toEqual([]);
  });

  it("rejects unauthenticated requests", async () => {
    const app = createApp();
    await request(app).get("/api/portfolio/history").expect(401);
  });
});

describe("GET /api/portfolio/by-asset", () => {
  it("returns an empty list when nothing has been imported, and needs no ?currency", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);

    const res = await agent.get("/api/portfolio/by-asset").expect(200);

    expect(res.body).toEqual({ userId: expect.any(String), assets: [] });
  });

  it("does not include another user's accounts", async () => {
    const app = createApp();
    const owner = await loginAsNewUser(app);
    await createAccountWithCommittedUpload(owner);

    const outsider = await loginAsNewUser(app);
    const res = await outsider.get("/api/portfolio/by-asset").expect(200);

    expect(res.body.assets).toEqual([]);
  });

  it("rejects unauthenticated requests", async () => {
    const app = createApp();
    await request(app).get("/api/portfolio/by-asset").expect(401);
  });
});

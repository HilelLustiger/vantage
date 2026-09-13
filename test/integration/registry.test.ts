import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "@vantage/backend/app";
import { createUser } from "@vantage/backend/repositories/users";
import { hashPassword } from "@vantage/backend/password";

// Exercises the real HTTP surface (institutions/accounts/assets) end-to-end
// against a real Postgres, the same way auth.test.ts does.
async function loginAsNewUser(app: ReturnType<typeof createApp>) {
  const email = `test-${randomUUID()}@example.com`;
  const password = "correct-horse-battery-staple";
  const user = await createUser({ email, passwordHash: await hashPassword(password) });

  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password }).expect(200);
  return { agent, userId: user.id };
}

describe("institutions", () => {
  it("has no create endpoint — only created inline via POST /api/accounts", async () => {
    const app = createApp();
    const { agent } = await loginAsNewUser(app);

    await agent.post("/api/institutions").send({ name: "Should not exist" }).expect(404);
  });

  it("lists an institution created inline by an account", async () => {
    const app = createApp();
    const { agent } = await loginAsNewUser(app);
    const name = `Bank ${randomUUID()}`;

    const account = await agent
      .post("/api/accounts")
      .send({ name: "Test Account", newInstitutionName: name })
      .expect(201);

    const list = await agent.get("/api/institutions").expect(200);
    expect(list.body.map((i: { id: string }) => i.id)).toContain(account.body.institutionId);
    expect(list.body.find((i: { id: string }) => i.id === account.body.institutionId).name).toBe(
      name,
    );
  });

  it("rejects unauthenticated requests", async () => {
    const app = createApp();
    await request(app).get("/api/institutions").expect(401);
  });
});

describe("assets", () => {
  it("creates and lists assets", async () => {
    const app = createApp();
    const { agent } = await loginAsNewUser(app);

    const created = await agent
      .post("/api/assets")
      .send({ type: "stock", name: "Example Corp", ticker: `EX-${randomUUID()}` })
      .expect(201);

    const list = await agent.get("/api/assets").expect(200);
    expect(list.body.map((a: { id: string }) => a.id)).toContain(created.body.id);
  });

  it("rejects unauthenticated requests", async () => {
    const app = createApp();
    await request(app).get("/api/assets").expect(401);
  });
});

describe("accounts", () => {
  it("is visible to every authenticated user — single shared household, not per-owner scoped", async () => {
    const app = createApp();
    const { agent: creator } = await loginAsNewUser(app);
    const { agent: otherUser } = await loginAsNewUser(app);

    const account = await creator
      .post("/api/accounts")
      .send({ name: "Joint Brokerage", newInstitutionName: `Bank ${randomUUID()}` })
      .expect(201);

    const otherUserList = await otherUser.get("/api/accounts").expect(200);
    expect(otherUserList.body.map((a: { id: string }) => a.id)).toContain(account.body.id);
  });

  it("creates an account against an existing institution", async () => {
    const app = createApp();
    const { agent } = await loginAsNewUser(app);

    const first = await agent
      .post("/api/accounts")
      .send({ name: "First Account", newInstitutionName: `Bank ${randomUUID()}` })
      .expect(201);

    const second = await agent
      .post("/api/accounts")
      .send({ name: "Second Account", institutionId: first.body.institutionId })
      .expect(201);

    expect(second.body.institutionId).toBe(first.body.institutionId);
    expect(second.body.institutionName).toBe(first.body.institutionName);
  });

  it("records the given ownerUserIds", async () => {
    const app = createApp();
    const { agent, userId } = await loginAsNewUser(app);

    const account = await agent
      .post("/api/accounts")
      .send({
        name: "Solo Brokerage",
        newInstitutionName: `Bank ${randomUUID()}`,
        ownerUserIds: [userId],
      })
      .expect(201);

    expect(account.body.ownerUserIds).toEqual([userId]);
  });

  it("rejects a request with neither institutionId nor newInstitutionName", async () => {
    const app = createApp();
    const { agent } = await loginAsNewUser(app);

    await agent.post("/api/accounts").send({ name: "Ghost Account" }).expect(400);
  });

  it("rejects an account for a non-existent institutionId", async () => {
    const app = createApp();
    const { agent } = await loginAsNewUser(app);

    await agent
      .post("/api/accounts")
      .send({ name: "Ghost Account", institutionId: randomUUID() })
      .expect(400);
  });

  it("rejects unauthenticated requests", async () => {
    const app = createApp();
    await request(app).get("/api/accounts").expect(401);
  });
});

describe("users", () => {
  it("lists users without exposing passwordHash", async () => {
    const app = createApp();
    const { agent, userId } = await loginAsNewUser(app);

    const list = await agent.get("/api/users").expect(200);

    const self = list.body.find((u: { id: string }) => u.id === userId);
    expect(self).toBeDefined();
    expect(self).not.toHaveProperty("passwordHash");
  });

  it("rejects unauthenticated requests", async () => {
    const app = createApp();
    await request(app).get("/api/users").expect(401);
  });
});

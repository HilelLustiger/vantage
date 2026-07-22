import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "@vantage/backend/app";
import { createUser } from "@vantage/backend/db/users";
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
  it("creates and lists institutions", async () => {
    const app = createApp();
    const { agent } = await loginAsNewUser(app);

    const created = await agent
      .post("/api/institutions")
      .send({ name: `Bank ${randomUUID()}` })
      .expect(201);

    const list = await agent.get("/api/institutions").expect(200);
    expect(list.body.map((i: { id: string }) => i.id)).toContain(created.body.id);
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
      .send({ type: "stock", name: "Example Corp", ticker: "EX" })
      .expect(201);

    const list = await agent.get("/api/assets").expect(200);
    expect(list.body.map((a: { id: string }) => a.id)).toContain(created.body.id);
  });
});

describe("accounts", () => {
  it("is visible to an explicit joint owner, not to an unrelated user", async () => {
    const app = createApp();
    const { agent: owner1, userId: owner1Id } = await loginAsNewUser(app);
    const { userId: owner2Id } = await loginAsNewUser(app);
    const { agent: outsider } = await loginAsNewUser(app);

    const institution = await owner1
      .post("/api/institutions")
      .send({ name: `Bank ${randomUUID()}` })
      .expect(201);

    const account = await owner1
      .post("/api/accounts")
      .send({
        institutionId: institution.body.id,
        name: "Joint Brokerage",
        ownerUserIds: [owner2Id],
      })
      .expect(201);
    expect(new Set(account.body.ownerUserIds)).toEqual(new Set([owner1Id, owner2Id]));

    const owner1List = await owner1.get("/api/accounts").expect(200);
    expect(owner1List.body.map((a: { id: string }) => a.id)).toContain(account.body.id);

    const outsiderList = await outsider.get("/api/accounts").expect(200);
    expect(outsiderList.body.map((a: { id: string }) => a.id)).not.toContain(account.body.id);

    await outsider.get(`/api/accounts/${account.body.id}`).expect(404);
    await owner1.get(`/api/accounts/${account.body.id}`).expect(200);
  });

  it("auto-includes the creator when ownerUserIds is omitted", async () => {
    const app = createApp();
    const { agent, userId } = await loginAsNewUser(app);

    const institution = await agent
      .post("/api/institutions")
      .send({ name: `Bank ${randomUUID()}` })
      .expect(201);

    const account = await agent
      .post("/api/accounts")
      .send({ institutionId: institution.body.id, name: "Solo Brokerage" })
      .expect(201);

    expect(account.body.ownerUserIds).toEqual([userId]);
  });

  it("rejects an account for a non-existent institution", async () => {
    const app = createApp();
    const { agent } = await loginAsNewUser(app);

    await agent
      .post("/api/accounts")
      .send({ institutionId: randomUUID(), name: "Ghost Account" })
      .expect(400);
  });
});

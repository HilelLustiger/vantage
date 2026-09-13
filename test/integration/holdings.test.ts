import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "@vantage/backend/app";
import { createUser } from "@vantage/backend/repositories/users";
import { hashPassword } from "@vantage/backend/password";

// No Document ingest pipeline exists yet (see backend/src/app.ts's own
// note on this), so there's no way to get an actual Holding into the test
// DB — this suite covers what's actually reachable today: the empty-state
// shape, query validation, and auth, not the valuation math itself (that's
// services/holdings.test.ts's job once it has fixtures to compute over).
async function loginAsNewUser(app: ReturnType<typeof createApp>) {
  const email = `test-${randomUUID()}@example.com`;
  const password = "correct-horse-battery-staple";
  await createUser({ email, passwordHash: await hashPassword(password) });

  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password }).expect(200);
  return agent;
}

describe("GET /api/holdings", () => {
  it("returns an empty list when nothing has been imported", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);

    const res = await agent.get("/api/holdings?currency=ILS").expect(200);

    expect(res.body).toEqual([]);
  });

  it("requires a currency query param", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);

    await agent.get("/api/holdings").expect(400);
  });

  it("rejects unauthenticated requests", async () => {
    const app = createApp();
    await request(app).get("/api/holdings?currency=ILS").expect(401);
  });
});

describe("GET /api/holdings/history", () => {
  it("returns an empty history when nothing has been imported", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);

    const res = await agent.get("/api/holdings/history?currency=ILS").expect(200);

    expect(res.body).toEqual([]);
  });

  it("requires a currency query param", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);

    await agent.get("/api/holdings/history").expect(400);
  });

  it("rejects unauthenticated requests", async () => {
    const app = createApp();
    await request(app).get("/api/holdings/history?currency=ILS").expect(401);
  });
});

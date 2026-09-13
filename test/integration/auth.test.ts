import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "@vantage/backend/app";
import { createUser } from "@vantage/backend/repositories/users";
import { hashPassword } from "@vantage/backend/password";

// Exercises the real HTTP surface end-to-end against a real Postgres
// (migrated separately — see package.json's db:migrate). Creates its user via
// the same createUser() the CLI seed script calls, not a shell-out.
describe("auth flow", () => {
  it("logs in, reads /me, and logs out", async () => {
    const app = createApp();
    const email = `test-${randomUUID()}@example.com`;
    const password = "correct-horse-battery-staple";
    await createUser({ email, passwordHash: await hashPassword(password) });

    const agent = request.agent(app);

    await agent.post("/api/auth/login").send({ email, password }).expect(200);

    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.email).toBe(email);

    await agent.post("/api/auth/logout").expect(204);
    await agent.get("/api/auth/me").expect(401);
  });

  it("rejects an unknown email", async () => {
    const app = createApp();
    await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "whatever" })
      .expect(401);
  });
});

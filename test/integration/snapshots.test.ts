import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "@vantage/backend/app";
import { createUser } from "@vantage/backend/db/users";
import { hashPassword } from "@vantage/backend/password";

// Two distinct byte sequences so re-uploads land on different checksums
// (not treated as a duplicate) while the fake parser (vitest.setup.ts)
// still returns the same asOfDate for both — the real trigger for
// supersede (ADR-0009), not identical bytes.
const PDF_BYTES_A = Buffer.from("%PDF-1.4\n%%EOF");
const PDF_BYTES_B = Buffer.from("%PDF-1.4\n% second version\n%%EOF");

async function loginAsNewUser(app: ReturnType<typeof createApp>) {
  const email = `test-${randomUUID()}@example.com`;
  const password = "correct-horse-battery-staple";
  await createUser({ email, passwordHash: await hashPassword(password) });

  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password }).expect(200);
  return agent;
}

async function createAccount(agent: ReturnType<typeof request.agent>) {
  const institution = await agent
    .post("/api/institutions")
    .send({ name: `Bank ${randomUUID()}` })
    .expect(201);
  const account = await agent
    .post("/api/accounts")
    .send({ institutionId: institution.body.id, name: "Test Account" })
    .expect(201);
  return account.body.id as string;
}

async function uploadDocument(
  agent: ReturnType<typeof request.agent>,
  accountId: string,
  bytes: Buffer,
) {
  const res = await agent
    .post("/api/documents")
    .field("accountId", accountId)
    .attach("file", bytes, { filename: "statement.pdf", contentType: "application/pdf" })
    .expect(201);
  return res.body as { id: string; status: string };
}

describe("snapshot reads", () => {
  it("lists a committed upload's snapshot and holdings", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);
    const accountId = await createAccount(agent);

    const document = await uploadDocument(agent, accountId, PDF_BYTES_A);
    expect(document.status).toBe("committed");

    const list = await agent.get("/api/snapshots").expect(200);
    expect(list.body).toHaveLength(1);
    const snapshot = list.body[0];
    expect(snapshot.accountId).toBe(accountId);
    expect(snapshot.documentId).toBe(document.id);
    expect(snapshot.isActive).toBe(true);

    const single = await agent.get(`/api/snapshots/${snapshot.id}`).expect(200);
    expect(single.body).toEqual(snapshot);

    const holdings = await agent.get(`/api/snapshots/${snapshot.id}/holdings`).expect(200);
    expect(holdings.body).toEqual([]);
  });

  it("supersedes on a second import for the same account+date", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);
    const accountId = await createAccount(agent);

    await uploadDocument(agent, accountId, PDF_BYTES_A);
    const firstActive = (await agent.get("/api/snapshots").expect(200)).body[0];

    const second = await uploadDocument(agent, accountId, PDF_BYTES_B);
    expect(second.status).toBe("committed");

    const activeList = await agent.get("/api/snapshots").expect(200);
    expect(activeList.body).toHaveLength(1);
    expect(activeList.body[0].id).not.toBe(firstActive.id);
    expect(activeList.body[0].documentId).toBe(second.id);

    const fullList = await agent.get("/api/snapshots?includeSuperseded=true").expect(200);
    expect(fullList.body).toHaveLength(2);
    const superseded = fullList.body.find((s: { id: string }) => s.id === firstActive.id);
    expect(superseded.isActive).toBe(false);
    expect(superseded.supersededBySnapshotId).toBe(activeList.body[0].id);
  });

  it("404s for a snapshot the caller can't see, and excludes it from their list", async () => {
    const app = createApp();
    const owner = await loginAsNewUser(app);
    const accountId = await createAccount(owner);
    await uploadDocument(owner, accountId, PDF_BYTES_A);
    const [snapshot] = (await owner.get("/api/snapshots").expect(200)).body;

    const outsider = await loginAsNewUser(app);
    await outsider.get(`/api/snapshots/${snapshot.id}`).expect(404);
    await outsider.get(`/api/snapshots/${snapshot.id}/holdings`).expect(404);
    const outsiderList = await outsider.get("/api/snapshots").expect(200);
    expect(outsiderList.body).toEqual([]);
  });

  it("rejects unauthenticated requests", async () => {
    const app = createApp();
    await request(app).get("/api/snapshots").expect(401);
  });
});

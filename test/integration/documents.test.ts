import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "@vantage/backend/app";
import { createUser } from "@vantage/backend/db/users";
import { hashPassword } from "@vantage/backend/password";

// A minimal valid PDF — nothing parses it yet (that's M4), it just needs to
// pass the fileFilter's mimetype check and be storable as bytes.
const PDF_BYTES = Buffer.from("%PDF-1.4\n%%EOF");

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

describe("document upload", () => {
  it("stores the file and starts import, ending up processing", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);
    const accountId = await createAccount(agent);

    const res = await agent
      .post("/api/documents")
      .field("accountId", accountId)
      .attach("file", PDF_BYTES, { filename: "statement.pdf", contentType: "application/pdf" })
      .expect(201);

    expect(res.body.accountId).toBe(accountId);
    expect(res.body.status).toBe("processing");
    expect(res.body.format).toBe("pdf");
    expect(res.body.feature).toBe("investments");
  });

  it("marks a re-upload of the same bytes to the same account as duplicate", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);
    const accountId = await createAccount(agent);

    await agent
      .post("/api/documents")
      .field("accountId", accountId)
      .attach("file", PDF_BYTES, { filename: "statement.pdf", contentType: "application/pdf" })
      .expect(201);

    const second = await agent
      .post("/api/documents")
      .field("accountId", accountId)
      .attach("file", PDF_BYTES, { filename: "statement.pdf", contentType: "application/pdf" })
      .expect(201);

    expect(second.body.status).toBe("duplicate");
  });

  it("does not treat the same bytes on a different account as a duplicate", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);
    const accountA = await createAccount(agent);
    const accountB = await createAccount(agent);

    await agent
      .post("/api/documents")
      .field("accountId", accountA)
      .attach("file", PDF_BYTES, { filename: "statement.pdf", contentType: "application/pdf" })
      .expect(201);

    const second = await agent
      .post("/api/documents")
      .field("accountId", accountB)
      .attach("file", PDF_BYTES, { filename: "statement.pdf", contentType: "application/pdf" })
      .expect(201);

    expect(second.body.status).toBe("processing");
  });

  it("rejects a non-PDF file", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);
    const accountId = await createAccount(agent);

    await agent
      .post("/api/documents")
      .field("accountId", accountId)
      .attach("file", Buffer.from("not a pdf"), {
        filename: "statement.txt",
        contentType: "text/plain",
      })
      .expect(400);
  });

  it("rejects an accountId the caller doesn't own", async () => {
    const app = createApp();
    const owner = await loginAsNewUser(app);
    const accountId = await createAccount(owner);
    const outsider = await loginAsNewUser(app);

    await outsider
      .post("/api/documents")
      .field("accountId", accountId)
      .attach("file", PDF_BYTES, { filename: "statement.pdf", contentType: "application/pdf" })
      .expect(404);
  });

  it("rejects an unauthenticated upload", async () => {
    const app = createApp();
    await request(app)
      .post("/api/documents")
      .field("accountId", randomUUID())
      .attach("file", PDF_BYTES, { filename: "statement.pdf", contentType: "application/pdf" })
      .expect(401);
  });

  it("only lists documents for the caller's own accounts", async () => {
    const app = createApp();
    const owner = await loginAsNewUser(app);
    const accountId = await createAccount(owner);
    await owner
      .post("/api/documents")
      .field("accountId", accountId)
      .attach("file", PDF_BYTES, { filename: "statement.pdf", contentType: "application/pdf" })
      .expect(201);

    const outsider = await loginAsNewUser(app);
    const outsiderList = await outsider.get("/api/documents").expect(200);
    expect(outsiderList.body).toEqual([]);

    const ownerList = await owner.get("/api/documents").expect(200);
    expect(ownerList.body).toHaveLength(1);
    expect(ownerList.body[0].accountId).toBe(accountId);
  });
});

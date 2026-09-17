import { randomUUID } from "node:crypto";
import request from "supertest";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "@vantage/backend/app";
import { createUser } from "@vantage/backend/repositories/users";
import { hashPassword } from "@vantage/backend/password";
import { db } from "@vantage/backend/db/client";
import { holdings } from "@vantage/backend/db/schema";

// Exercises the real HTTP surface end-to-end against a real Postgres, the
// same way registry.test.ts/holdings.test.ts do — except `parser` itself is
// stubbed at the fetch boundary (services/parser.ts's segmentDocument/
// extractFromBuffer), since parser is a separate process this suite doesn't
// stand up. What's real: the Document state machine, the pending-review
// table, and the resolve logic that turns parser's response into Holdings/
// Transactions/Assets.
async function loginAsNewUser(app: ReturnType<typeof createApp>) {
  const email = `test-${randomUUID()}@example.com`;
  const password = "correct-horse-battery-staple";
  await createUser({ email, passwordHash: await hashPassword(password) });

  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password }).expect(200);
  return agent;
}

async function createAccount(agent: ReturnType<typeof request.agent>) {
  const res = await agent
    .post("/api/accounts")
    .send({ name: "Test Account", newInstitutionName: `Bank ${randomUUID()}` })
    .expect(201);
  return res.body.id as string;
}

function mockParser({
  segmentResult,
  extractResults = [],
}: {
  segmentResult: unknown;
  extractResults?: unknown[];
}) {
  let extractCallIndex = 0;
  const fetchMock = vi.fn(async (url: string) => {
    if (url.toString().endsWith("/segment")) {
      return { ok: true, status: 200, json: async () => segmentResult };
    }
    if (url.toString().endsWith("/extract")) {
      const result = extractResults[extractCallIndex];
      extractCallIndex += 1;
      return { ok: true, status: 200, json: async () => result };
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function uploadDocument(agent: ReturnType<typeof request.agent>, accountId: string) {
  return agent
    .post("/api/documents")
    .field("accountId", accountId)
    .attach("file", Buffer.from("%PDF-1.4 dummy"), "statement.pdf");
}

const bbox = { x0: 0, top: 0, x1: 100, bottom: 10 };

const contentReviewResult = {
  outcome: "needs_review",
  asOfDate: "2026-01-01",
  review: {
    reason: "content_review",
    lines: [
      { index: 0, status: "redacted", text: null, flagReason: null, bbox },
      { index: 1, status: "included", text: "Fund ABC 10 1500.00", flagReason: null, bbox },
      {
        index: 2,
        status: "flagged",
        text: "Jane Doe 123 456 789",
        flagReason: "looks like a name",
        bbox,
      },
    ],
    pageWidth: 595,
    pageHeight: 842,
    identityValues: {
      accountHolder: "Jane Doe",
      accountNumber: null,
      asOfDate: "2026-01-01",
      statementBalance: null,
    },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/documents", () => {
  it("rejects unauthenticated requests", async () => {
    const app = createApp();
    await request(app).post("/api/documents").expect(401);
  });

  it("uploads and stores a content_review pending review", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);
    const accountId = await createAccount(agent);
    mockParser({ segmentResult: contentReviewResult });

    const res = await uploadDocument(agent, accountId).expect(201);

    expect(res.body.status).toBe("needs_review");
    expect(res.body.accountId).toBe(accountId);
  });

  it("marks a re-upload of the same file as duplicate without calling parser", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);
    const accountId = await createAccount(agent);
    const fetchMock = mockParser({ segmentResult: contentReviewResult });

    await uploadDocument(agent, accountId).expect(201);
    const second = await uploadDocument(agent, accountId).expect(201);

    expect(second.body.status).toBe("duplicate");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marks the document failed when parser can't read the file", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);
    const accountId = await createAccount(agent);
    mockParser({ segmentResult: { outcome: "failed", reason: "could not read file as a PDF" } });

    const res = await uploadDocument(agent, accountId).expect(201);

    expect(res.body.status).toBe("failed");
    expect(res.body.failureReason).toBe("could not read file as a PDF");
  });
});

describe("GET /api/documents/:id/review", () => {
  it("returns content_review without identityValues", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);
    const accountId = await createAccount(agent);
    mockParser({ segmentResult: contentReviewResult });
    const document = await uploadDocument(agent, accountId).expect(201);

    const res = await agent.get(`/api/documents/${document.body.id}/review`).expect(200);

    expect(res.body.reason).toBe("content_review");
    expect(res.body.lines).toEqual(contentReviewResult.review.lines);
    expect(res.body.pageWidth).toBe(contentReviewResult.review.pageWidth);
    expect(res.body.pageHeight).toBe(contentReviewResult.review.pageHeight);
    expect(res.body.identityValues).toBeUndefined();
  });

  it("404s for a document that was never uploaded", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);

    await agent.get(`/api/documents/${randomUUID()}/review`).expect(404);
  });

  it("rejects unauthenticated requests", async () => {
    const app = createApp();
    await request(app).get(`/api/documents/${randomUUID()}/review`).expect(401);
  });
});

describe("GET /api/documents/:id/file", () => {
  it("serves the raw uploaded file — the content_review overlay's bbox units only make sense against this exact file", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);
    const accountId = await createAccount(agent);
    mockParser({ segmentResult: contentReviewResult });
    const fileBytes = Buffer.from("%PDF-1.4 dummy");
    const document = await agent
      .post("/api/documents")
      .field("accountId", accountId)
      .attach("file", fileBytes, "statement.pdf")
      .expect(201);

    const res = await agent
      .get(`/api/documents/${document.body.id}/file`)
      .expect(200)
      .expect("Content-Type", "application/pdf");

    expect(Buffer.compare(res.body, fileBytes)).toBe(0);
  });

  it("404s for a document that was never uploaded", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);

    await agent.get(`/api/documents/${randomUUID()}/file`).expect(404);
  });

  it("rejects unauthenticated requests", async () => {
    const app = createApp();
    await request(app).get(`/api/documents/${randomUUID()}/file`).expect(401);
  });
});

describe("POST /api/documents/:id/resolve", () => {
  it("commits directly when parser's extract resolves every line", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);
    const accountId = await createAccount(agent);
    const asset = await agent
      .post("/api/assets")
      .send({ type: "stock", name: "Example Corp", ticker: `EX-${randomUUID()}` })
      .expect(201);

    mockParser({
      segmentResult: contentReviewResult,
      extractResults: [
        {
          outcome: "committed",
          asOfDate: "2026-01-01",
          holdings: [{ assetId: asset.body.id, quantity: "10", value: "1500", currency: "ILS" }],
          transactions: [],
        },
      ],
    });
    const document = await uploadDocument(agent, accountId).expect(201);

    const res = await agent
      .post(`/api/documents/${document.body.id}/resolve`)
      .send({ resolutions: [{ approveContentReview: { includedIndices: [1] } }] })
      .expect(200);

    expect(res.body.status).toBe("committed");
  });

  it("moves into extraction_review when parser's extract can't match an asset, then commits", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);
    const accountId = await createAccount(agent);
    const asset = await agent
      .post("/api/assets")
      .send({ type: "stock", name: "Example Corp", ticker: `EX-${randomUUID()}` })
      .expect(201);

    mockParser({
      segmentResult: contentReviewResult,
      extractResults: [
        {
          outcome: "needs_review",
          asOfDate: "2026-01-01",
          review: {
            reason: "extraction_review",
            failedChecks: [],
            lines: [
              {
                index: 0,
                kind: "holding",
                assetName: "Unknown Fund",
                quantity: "10",
                value: "1500",
                currency: "ILS",
              },
            ],
          },
        },
      ],
    });
    const document = await uploadDocument(agent, accountId).expect(201);

    const afterContentReview = await agent
      .post(`/api/documents/${document.body.id}/resolve`)
      .send({ resolutions: [{ approveContentReview: { includedIndices: [1] } }] })
      .expect(200);
    expect(afterContentReview.body.status).toBe("needs_review");

    const review = await agent.get(`/api/documents/${document.body.id}/review`).expect(200);
    expect(review.body.reason).toBe("extraction_review");
    // A holding's "current value" only means something relative to a date —
    // the review screen needs it to say so, not just show a bare number.
    expect(review.body.asOfDate).toBe("2026-01-01");

    const resolved = await agent
      .post(`/api/documents/${document.body.id}/resolve`)
      .send({ resolutions: [{ index: 0, kind: "holding", assetId: asset.body.id }] })
      .expect(200);
    expect(resolved.body.status).toBe("committed");
  });

  it("applies a human-corrected value over the model's own figure before committing", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);
    const accountId = await createAccount(agent);
    const asset = await agent
      .post("/api/assets")
      .send({ type: "stock", name: "Example Corp", ticker: `EX-${randomUUID()}` })
      .expect(201);

    mockParser({
      segmentResult: contentReviewResult,
      extractResults: [
        {
          outcome: "needs_review",
          asOfDate: "2026-01-01",
          review: {
            reason: "extraction_review",
            failedChecks: [],
            lines: [
              {
                index: 0,
                kind: "holding",
                assetName: "Unknown Fund",
                quantity: "10",
                value: "1500",
                currency: "ILS",
              },
            ],
          },
        },
      ],
    });
    const document = await uploadDocument(agent, accountId).expect(201);
    await agent
      .post(`/api/documents/${document.body.id}/resolve`)
      .send({ resolutions: [{ approveContentReview: { includedIndices: [1] } }] })
      .expect(200);

    const resolved = await agent
      .post(`/api/documents/${document.body.id}/resolve`)
      .send({ resolutions: [{ index: 0, kind: "holding", assetId: asset.body.id, value: "1600" }] })
      .expect(200);
    expect(resolved.body.status).toBe("committed");

    const [holding] = await db
      .select()
      .from(holdings)
      .where(eq(holdings.documentId, document.body.id));
    expect(holding.value).toBe("1600");
  });

  it("fails the document when no content is approved", async () => {
    const app = createApp();
    const agent = await loginAsNewUser(app);
    const accountId = await createAccount(agent);
    mockParser({ segmentResult: contentReviewResult });
    const document = await uploadDocument(agent, accountId).expect(201);

    const res = await agent
      .post(`/api/documents/${document.body.id}/resolve`)
      .send({ resolutions: [] })
      .expect(200);

    expect(res.body.status).toBe("failed");
  });

  it("rejects unauthenticated requests", async () => {
    const app = createApp();
    await request(app)
      .post(`/api/documents/${randomUUID()}/resolve`)
      .send({ resolutions: [] })
      .expect(401);
  });
});

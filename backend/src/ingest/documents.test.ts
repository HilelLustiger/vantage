import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createAccountWithOwners } from "../shared/db/accounts.js";
import { db } from "../shared/db/client.js";
import { insertDocument } from "../shared/db/documents.js";
import { createInstitution } from "../shared/db/institutions.js";
import { documents } from "../shared/db/schema.js";
import { createUser } from "../shared/db/users.js";
import {
  IllegalDocumentTransitionError,
  storeParsedData,
  storeResolvedHoldings,
  transitionDocument,
  transitionDocumentToNeedsReview,
  transitionDocumentToNeedsReviewForValidityFailure,
  transitionDocumentWithFailure,
} from "./documents.js";

async function createTestAccount() {
  const user = await createUser({
    email: `test-${randomUUID()}@example.com`,
    passwordHash: "not-checked-in-these-tests",
  });
  const institution = await createInstitution({ name: `Bank ${randomUUID()}` });
  return createAccountWithOwners({
    institutionId: institution.id,
    name: "Test Account",
    ownerUserIds: [user.id],
  });
}

describe("transitionDocument", () => {
  it("walks the full happy path: uploaded -> processing -> needs_review -> committed", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });

    expect((await transitionDocument(document.id, "processing")).status).toBe("processing");
    expect((await transitionDocument(document.id, "needs_review")).status).toBe("needs_review");
    expect((await transitionDocument(document.id, "committed")).status).toBe("committed");
  });

  it("allows needs_review -> failed", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    await transitionDocument(document.id, "processing");
    await transitionDocument(document.id, "needs_review");

    expect((await transitionDocument(document.id, "failed")).status).toBe("failed");
  });

  it("allows uploaded -> duplicate", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });

    expect((await transitionDocument(document.id, "duplicate")).status).toBe("duplicate");
  });

  it("rejects a transition not in the graph", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });

    await expect(transitionDocument(document.id, "committed")).rejects.toThrow(
      IllegalDocumentTransitionError,
    );
  });

  it("rejects transitioning out of a terminal state", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    await transitionDocument(document.id, "duplicate");

    await expect(transitionDocument(document.id, "processing")).rejects.toThrow(
      IllegalDocumentTransitionError,
    );
  });
});

describe("transitionDocumentWithFailure", () => {
  it("transitions to failed and records the reason", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    await transitionDocument(document.id, "processing");

    const updated = await transitionDocumentWithFailure(document.id, "unreadable file");

    expect(updated.status).toBe("failed");
    expect(updated.failureReason).toBe("unreadable file");
  });

  it("rejects a transition not in the graph", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    await transitionDocument(document.id, "processing");
    await transitionDocument(document.id, "committed");

    await expect(transitionDocumentWithFailure(document.id, "too late")).rejects.toThrow(
      IllegalDocumentTransitionError,
    );
  });
});

describe("storeParsedData", () => {
  it("stashes the raw parse result without changing status", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    await transitionDocument(document.id, "processing");

    const updated = await storeParsedData(document.id, { holdings: ["fake"] });

    expect(updated.status).toBe("processing");
    const [row] = await db.select().from(documents).where(eq(documents.id, document.id));
    expect(row.parsedData).toEqual({ holdings: ["fake"] });
  });
});

describe("storeResolvedHoldings", () => {
  it("stashes the resolved asset ids without changing status", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    await transitionDocument(document.id, "processing");

    const updated = await storeResolvedHoldings(document.id, ["asset-1", null]);

    expect(updated.status).toBe("processing");
    const [row] = await db.select().from(documents).where(eq(documents.id, document.id));
    expect(row.resolvedHoldings).toEqual(["asset-1", null]);
  });
});

describe("transitionDocumentToNeedsReview", () => {
  it("transitions to needs_review and records the resolved holdings", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    await transitionDocument(document.id, "processing");

    const updated = await transitionDocumentToNeedsReview(document.id, [null]);

    expect(updated.status).toBe("needs_review");
    expect(updated.resolvedHoldings).toEqual([null]);
  });

  it("rejects a transition not in the graph", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });

    await expect(transitionDocumentToNeedsReview(document.id, [null])).rejects.toThrow(
      IllegalDocumentTransitionError,
    );
  });
});

describe("transitionDocumentToNeedsReviewForValidityFailure", () => {
  it("transitions to needs_review and records the raw values + failed checks", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    await transitionDocument(document.id, "processing");

    const updated = await transitionDocumentToNeedsReviewForValidityFailure(
      document.id,
      { endingBalance: null },
      [{ name: "endingBalance", computed: null, claimed: null, matched: false }],
    );

    expect(updated.status).toBe("needs_review");
    const [row] = await db.select().from(documents).where(eq(documents.id, document.id));
    expect(row.parsedData).toEqual({ endingBalance: null });
    expect(row.validityFailedChecks).toEqual([
      { name: "endingBalance", computed: null, claimed: null, matched: false },
    ]);
  });

  it("rejects a transition not in the graph", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });

    await expect(
      transitionDocumentToNeedsReviewForValidityFailure(document.id, {}, []),
    ).rejects.toThrow(IllegalDocumentTransitionError);
  });
});

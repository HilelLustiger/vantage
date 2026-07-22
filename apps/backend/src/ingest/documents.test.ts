import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAccountWithOwners } from "../shared/db/accounts.js";
import { insertDocument } from "../shared/db/documents.js";
import { createInstitution } from "../shared/db/institutions.js";
import { createUser } from "../shared/db/users.js";
import { IllegalDocumentTransitionError, transitionDocument } from "./documents.js";

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
    expect((await transitionDocument(document.id, "needs_review")).status).toBe(
      "needs_review",
    );
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

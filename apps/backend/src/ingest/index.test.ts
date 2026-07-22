import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { createAccountWithOwners } from "../shared/db/accounts.js";
import { db } from "../shared/db/client.js";
import { findDocumentById, insertDocument } from "../shared/db/documents.js";
import { createInstitution } from "../shared/db/institutions.js";
import { documents } from "../shared/db/schema.js";
import { createUser } from "../shared/db/users.js";
import { transitionDocument } from "./documents.js";
import { ingest } from "./index.js";
import { parseDocument } from "./parserClient.js";

vi.mock("../shared/storage.js", () => ({
  readDocumentFile: vi.fn().mockResolvedValue(Buffer.from("not a real pdf")),
}));
vi.mock("./parserClient.js", () => ({
  parseDocument: vi.fn().mockResolvedValue({ ok: true, data: {} }),
}));

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

describe("ingest.startImport", () => {
  it("moves a fresh upload to processing when no duplicate exists", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });

    await ingest.startImport(document.id);

    expect((await findDocumentById(document.id))?.status).toBe("processing");
  });

  it("moves to duplicate when the checksum matches an active document on the same account", async () => {
    const account = await createTestAccount();
    const checksum = randomUUID();
    const first = await insertDocument({ accountId: account.id, checksum });
    await ingest.startImport(first.id);

    const second = await insertDocument({ accountId: account.id, checksum });
    await ingest.startImport(second.id);

    expect((await findDocumentById(second.id))?.status).toBe("duplicate");
  });

  it("proceeds to processing when the only checksum match is failed", async () => {
    const account = await createTestAccount();
    const checksum = randomUUID();
    const first = await insertDocument({ accountId: account.id, checksum });
    await transitionDocument(first.id, "processing");
    await transitionDocument(first.id, "needs_review");
    await transitionDocument(first.id, "failed");

    const second = await insertDocument({ accountId: account.id, checksum });
    await ingest.startImport(second.id);

    expect((await findDocumentById(second.id))?.status).toBe("processing");
  });

  it("does not match a duplicate checksum on a different account", async () => {
    const accountA = await createTestAccount();
    const accountB = await createTestAccount();
    const checksum = randomUUID();
    const first = await insertDocument({ accountId: accountA.id, checksum });
    await ingest.startImport(first.id);

    const second = await insertDocument({ accountId: accountB.id, checksum });
    await ingest.startImport(second.id);

    expect((await findDocumentById(second.id))?.status).toBe("processing");
  });

  it("throws for a document that isn't uploaded", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });
    await ingest.startImport(document.id);

    await expect(ingest.startImport(document.id)).rejects.toThrow();
  });

  it("throws for a missing document", async () => {
    await expect(ingest.startImport(randomUUID())).rejects.toThrow("not found");
  });

  it("stores the parsed data and stays in processing on a successful parse", async () => {
    vi.mocked(parseDocument).mockResolvedValueOnce({
      ok: true,
      data: { holdings: ["fake-holding"] },
    });
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });

    await ingest.startImport(document.id);

    expect((await findDocumentById(document.id))?.status).toBe("processing");
    const [row] = await db.select().from(documents).where(eq(documents.id, document.id));
    expect(row.parsedData).toEqual({ holdings: ["fake-holding"] });
  });

  it("transitions to failed with the reason on an unsuccessful parse", async () => {
    vi.mocked(parseDocument).mockResolvedValueOnce({
      ok: false,
      reason: "no matching parser (unrecognized institution)",
    });
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });

    await ingest.startImport(document.id);

    const final = await findDocumentById(document.id);
    expect(final?.status).toBe("failed");
    expect(final?.failureReason).toBe("no matching parser (unrecognized institution)");
  });
});

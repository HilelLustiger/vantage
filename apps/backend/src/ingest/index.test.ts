import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { createAccountWithOwners } from "../shared/db/accounts.js";
import { createAsset } from "../shared/db/assets.js";
import { findCashFlowsForAsset } from "../shared/db/cashFlows.js";
import { db } from "../shared/db/client.js";
import { findDocumentById, insertDocument } from "../shared/db/documents.js";
import { listHoldingsForSnapshot } from "../shared/db/holdings.js";
import { createInstitution } from "../shared/db/institutions.js";
import { documents } from "../shared/db/schema.js";
import { findActiveSnapshot } from "../shared/db/snapshots.js";
import { createUser } from "../shared/db/users.js";
import { transitionDocument } from "./documents.js";
import { ingest } from "./index.js";
import { parseDocument } from "./parserClient.js";

vi.mock("../shared/storage.js", () => ({
  readDocumentFile: vi.fn().mockResolvedValue(Buffer.from("not a real pdf")),
}));
vi.mock("./parserClient.js", () => ({
  parseDocument: vi
    .fn()
    .mockResolvedValue({ ok: true, data: { asOfDate: "31.03.2026", holdings: [] } }),
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
  it("processes a fresh upload through to committed when no duplicate exists", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });

    await ingest.startImport(document.id);

    expect((await findDocumentById(document.id))?.status).toBe("committed");
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

  it("proceeds to committed when the only checksum match is failed", async () => {
    const account = await createTestAccount();
    const checksum = randomUUID();
    const first = await insertDocument({ accountId: account.id, checksum });
    await transitionDocument(first.id, "processing");
    await transitionDocument(first.id, "needs_review");
    await transitionDocument(first.id, "failed");

    const second = await insertDocument({ accountId: account.id, checksum });
    await ingest.startImport(second.id);

    expect((await findDocumentById(second.id))?.status).toBe("committed");
  });

  it("does not match a duplicate checksum on a different account", async () => {
    const accountA = await createTestAccount();
    const accountB = await createTestAccount();
    const checksum = randomUUID();
    const first = await insertDocument({ accountId: accountA.id, checksum });
    await ingest.startImport(first.id);

    const second = await insertDocument({ accountId: accountB.id, checksum });
    await ingest.startImport(second.id);

    expect((await findDocumentById(second.id))?.status).toBe("committed");
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

  it("stores the parsed data and reaches committed when there are no holdings to resolve", async () => {
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });

    await ingest.startImport(document.id);

    expect((await findDocumentById(document.id))?.status).toBe("committed");
    const [row] = await db.select().from(documents).where(eq(documents.id, document.id));
    expect(row.parsedData).toEqual({ asOfDate: "31.03.2026", holdings: [] });
    expect(row.resolvedHoldings).toEqual([]);
  });

  it("resolves a holding that matches an existing Asset by ticker and reaches committed", async () => {
    const ticker = `TICK-${randomUUID()}`;
    const asset = await createAsset({ type: "stock", name: "Example Corp", ticker });
    vi.mocked(parseDocument).mockResolvedValueOnce({
      ok: true,
      data: {
        asOfDate: "31.03.2026",
        holdings: [
          { assetName: "Example Corp", quantity: "10", value: "1000", currency: "ILS", ticker },
        ],
      },
    });
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });

    await ingest.startImport(document.id);

    expect((await findDocumentById(document.id))?.status).toBe("committed");
    const [row] = await db.select().from(documents).where(eq(documents.id, document.id));
    expect(row.resolvedHoldings).toEqual([asset.id]);
    const snapshot = await findActiveSnapshot(account.id, "2026-03-31");
    await expect(listHoldingsForSnapshot(snapshot!.id)).resolves.toEqual([
      expect.objectContaining({ assetId: asset.id, quantity: "10", value: "1000" }),
    ]);
  });

  it("transitions to needs_review when a holding can't be confidently matched", async () => {
    vi.mocked(parseDocument).mockResolvedValueOnce({
      ok: true,
      data: {
        asOfDate: "31.03.2026",
        holdings: [
          { assetName: "Unrecognized Fund", quantity: "1", value: "1000", currency: "ILS" },
        ],
      },
    });
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });

    await ingest.startImport(document.id);

    expect((await findDocumentById(document.id))?.status).toBe("needs_review");
    const [row] = await db.select().from(documents).where(eq(documents.id, document.id));
    expect(row.resolvedHoldings).toEqual([null]);
  });

  it("transitions to failed when the parsed data doesn't match the expected shape", async () => {
    vi.mocked(parseDocument).mockResolvedValueOnce({
      ok: true,
      data: { unexpected: "shape" },
    });
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });

    await ingest.startImport(document.id);

    const final = await findDocumentById(document.id);
    expect(final?.status).toBe("failed");
    expect(final?.failureReason).toBe("parsed data was not in the expected shape");
  });

  it("transitions to failed when the statement date can't be parsed", async () => {
    vi.mocked(parseDocument).mockResolvedValueOnce({
      ok: true,
      data: { asOfDate: "not a real date", holdings: [] },
    });
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });

    await ingest.startImport(document.id);

    const final = await findDocumentById(document.id);
    expect(final?.status).toBe("failed");
    expect(final?.failureReason).toContain("not a real date");
  });

  it("reaches committed with zero Snapshots for a Hapoalim-transactions-shaped (flows-only) parse", async () => {
    const securityNumber = `SEC-${randomUUID()}`;
    const asset = await createAsset({ type: "mutual_fund", name: "Money Market", securityNumber });
    vi.mocked(parseDocument).mockResolvedValueOnce({
      ok: true,
      data: {
        institution: "Bank Hapoalim",
        transactions: [
          {
            date: "18/08/2025",
            securityNumber,
            assetName: "Money Market Fund",
            kind: "buy",
            amount: "250.64",
            currency: "ILS",
          },
        ],
      },
    });
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });

    await ingest.startImport(document.id);

    expect((await findDocumentById(document.id))?.status).toBe("committed");
    await expect(findActiveSnapshot(account.id, "2025-08-18")).resolves.toBeUndefined();
    await expect(findCashFlowsForAsset(asset.id)).resolves.toEqual([
      expect.objectContaining({ date: "2025-08-18", amount: "250.64", kind: "buy" }),
    ]);
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

  it("transitions to needs_review, not failed, when the parser itself flags a validity failure", async () => {
    // ADR-0026: distinct from the asset-resolution needs_review path above
    // — this one fires before asset resolution ever runs.
    vi.mocked(parseDocument).mockResolvedValueOnce({
      ok: false,
      needsReview: true,
      values: { endingBalance: null },
      failedChecks: [{ name: "endingBalance", computed: null, claimed: null, matched: false }],
    });
    const account = await createTestAccount();
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });

    await ingest.startImport(document.id);

    const final = await findDocumentById(document.id);
    expect(final?.status).toBe("needs_review");
    expect(final?.validityFailedChecks).toEqual([
      { name: "endingBalance", computed: null, claimed: null, matched: false },
    ]);
    const [row] = await db.select().from(documents).where(eq(documents.id, document.id));
    expect(row.parsedData).toEqual({ endingBalance: null });
  });
});

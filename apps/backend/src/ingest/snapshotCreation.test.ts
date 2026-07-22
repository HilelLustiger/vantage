import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAccountWithOwners } from "../shared/db/accounts.js";
import { createAsset } from "../shared/db/assets.js";
import { findDocumentById, insertDocument } from "../shared/db/documents.js";
import { listHoldingsForSnapshot } from "../shared/db/holdings.js";
import { createInstitution } from "../shared/db/institutions.js";
import { findActiveSnapshot, findSnapshotById } from "../shared/db/snapshots.js";
import { createUser } from "../shared/db/users.js";
import { transitionDocument } from "./documents.js";
import { commitSnapshot, parseStatementDate } from "./snapshotCreation.js";

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

async function createProcessingDocument(accountId: string) {
  const document = await insertDocument({ accountId, checksum: randomUUID() });
  await transitionDocument(document.id, "processing");
  return document;
}

describe("parseStatementDate", () => {
  it.each([
    ["31.12.2025", "2025-12-31"],
    ["31/03/2026", "2026-03-31"],
    ["01.01.2026", "2026-01-01"],
  ])("parses %s", (raw, expected) => {
    expect(parseStatementDate(raw)).toBe(expected);
  });

  // Real corrupted value from a Bank Hapoalim sample (#24) — a footnote
  // marker digit merges into the date. Must fail, not silently produce a
  // wrong date.
  it("rejects the real known-corrupted Hapoalim value", () => {
    expect(parseStatementDate("130.06.2026")).toBeNull();
  });

  it.each(["not a date", "2026-03-31", "31.13.2026", "32.01.2026"])("rejects %s", (raw) => {
    expect(parseStatementDate(raw)).toBeNull();
  });
});

describe("commitSnapshot", () => {
  it("creates a snapshot and holdings, and transitions the document to committed", async () => {
    const account = await createTestAccount();
    const document = await createProcessingDocument(account.id);
    const asset = await createAsset({ type: "stock", name: "Example Corp" });

    const result = await commitSnapshot(
      document.id,
      account.id,
      {
        asOfDate: "31.03.2026",
        holdings: [{ assetName: "Example Corp", quantity: "10", value: "1000", currency: "ILS" }],
      },
      [asset.id],
    );

    expect(result).toEqual({ ok: true });
    expect((await findDocumentById(document.id))?.status).toBe("committed");
    const snapshot = await findActiveSnapshot(account.id, "2026-03-31");
    expect(snapshot?.documentId).toBe(document.id);
    const holdingRows = await listHoldingsForSnapshot(snapshot!.id);
    expect(holdingRows).toEqual([
      {
        id: expect.any(String),
        snapshotId: snapshot!.id,
        assetId: asset.id,
        quantity: "10",
        value: "1000",
        currency: "ILS",
      },
    ]);
  });

  it("supersedes an existing active snapshot for the same account+date", async () => {
    const account = await createTestAccount();
    const asset = await createAsset({ type: "stock", name: "Example Corp" });

    const firstDocument = await createProcessingDocument(account.id);
    await commitSnapshot(
      firstDocument.id,
      account.id,
      {
        asOfDate: "31.03.2026",
        holdings: [{ assetName: "Example Corp", quantity: "10", value: "1000", currency: "ILS" }],
      },
      [asset.id],
    );
    const firstSnapshot = await findActiveSnapshot(account.id, "2026-03-31");

    const secondDocument = await createProcessingDocument(account.id);
    await commitSnapshot(
      secondDocument.id,
      account.id,
      {
        asOfDate: "31.03.2026",
        holdings: [{ assetName: "Example Corp", quantity: "12", value: "1200", currency: "ILS" }],
      },
      [asset.id],
    );

    const oldSnapshot = await findSnapshotById(firstSnapshot!.id);
    expect(oldSnapshot?.isActive).toBe(false);
    const newActive = await findActiveSnapshot(account.id, "2026-03-31");
    expect(newActive?.documentId).toBe(secondDocument.id);
    expect(oldSnapshot?.supersededBySnapshotId).toBe(newActive?.id);
  });

  it("returns ok:false without touching the document status when the date is unparseable", async () => {
    const account = await createTestAccount();
    const document = await createProcessingDocument(account.id);

    const result = await commitSnapshot(
      document.id,
      account.id,
      { asOfDate: "130.06.2026", holdings: [] },
      [],
    );

    expect(result).toEqual({ ok: false, reason: expect.stringContaining("130.06.2026") });
    expect((await findDocumentById(document.id))?.status).toBe("processing");
  });

  it("fails when parsed data has no asOfDate at all", async () => {
    const account = await createTestAccount();
    const document = await createProcessingDocument(account.id);

    const result = await commitSnapshot(document.id, account.id, { holdings: [] }, []);

    expect(result).toEqual({
      ok: false,
      reason: "parsed data did not include a statement date",
    });
  });

  it("creates an empty snapshot when there are no holdings", async () => {
    const account = await createTestAccount();
    const document = await createProcessingDocument(account.id);

    const result = await commitSnapshot(
      document.id,
      account.id,
      { asOfDate: "31.03.2026", holdings: [] },
      [],
    );

    expect(result).toEqual({ ok: true });
    const snapshot = await findActiveSnapshot(account.id, "2026-03-31");
    await expect(listHoldingsForSnapshot(snapshot!.id)).resolves.toEqual([]);
  });
});

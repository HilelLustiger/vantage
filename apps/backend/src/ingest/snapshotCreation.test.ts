import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAccountWithOwners } from "../shared/db/accounts.js";
import { createAsset } from "../shared/db/assets.js";
import { findCashFlowsForAsset } from "../shared/db/cashFlows.js";
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

  it("commits a transactions-only Document with zero Snapshots and correctly-signed cash_flows", async () => {
    const account = await createTestAccount();
    const document = await createProcessingDocument(account.id);
    const buyAsset = await createAsset({ type: "mutual_fund", name: "Money Market" });
    const sellAsset = await createAsset({ type: "mutual_fund", name: "Bond Fund" });

    const result = await commitSnapshot(
      document.id,
      account.id,
      {
        transactions: [
          {
            date: "18/08/2025",
            assetName: "Money Market Fund",
            kind: "buy",
            amount: "250.64",
            currency: "ILS",
          },
          {
            date: "10/11/2025",
            assetName: "Bond Fund",
            kind: "sell",
            amount: "100.37",
            currency: "ILS",
          },
        ],
      },
      [buyAsset.id, sellAsset.id],
    );

    expect(result).toEqual({ ok: true });
    expect((await findDocumentById(document.id))?.status).toBe("committed");
    await expect(findActiveSnapshot(account.id, "2025-08-18")).resolves.toBeUndefined();
    await expect(findCashFlowsForAsset(buyAsset.id)).resolves.toEqual([
      expect.objectContaining({ date: "2025-08-18", amount: "250.64", kind: "buy" }),
    ]);
    await expect(findCashFlowsForAsset(sellAsset.id)).resolves.toEqual([
      expect.objectContaining({ date: "2025-11-10", amount: "-100.37", kind: "sell" }),
    ]);
  });

  it("skips dividend/interest/other transactions entirely when committing", async () => {
    const account = await createTestAccount();
    const document = await createProcessingDocument(account.id);
    const asset = await createAsset({ type: "mutual_fund", name: "Money Market" });

    const result = await commitSnapshot(
      document.id,
      account.id,
      {
        transactions: [
          {
            date: "02/06/2026",
            assetName: "Dividend Payer",
            kind: "dividend",
            amount: "1.95",
            currency: "ILS",
          },
        ],
      },
      [],
    );

    expect(result).toEqual({ ok: true });
    await expect(findCashFlowsForAsset(asset.id)).resolves.toEqual([]);
  });

  it("commits both a Snapshot+Holdings and cash_flows for a dual-shape Document", async () => {
    const account = await createTestAccount();
    const document = await createProcessingDocument(account.id);
    const holdingAsset = await createAsset({ type: "etf", name: "S&P 500" });
    const flowAsset = await createAsset({ type: "etf", name: "S&P 500" });

    const result = await commitSnapshot(
      document.id,
      account.id,
      {
        asOfDate: "31.03.2026",
        holdings: [{ assetName: "S&P 500", quantity: "10", value: "1000", currency: "ILS" }],
        transactions: [
          {
            date: "18/08/2025",
            assetName: "S&P 500",
            kind: "buy",
            amount: "-250.64", // Excellence-style: signed from the cash side
            currency: "ILS",
            balanceAfter: "119084.00",
          },
        ],
      },
      [holdingAsset.id, flowAsset.id],
    );

    expect(result).toEqual({ ok: true });
    const snapshot = await findActiveSnapshot(account.id, "2026-03-31");
    await expect(listHoldingsForSnapshot(snapshot!.id)).resolves.toEqual([
      expect.objectContaining({ assetId: holdingAsset.id }),
    ]);
    await expect(findCashFlowsForAsset(flowAsset.id)).resolves.toEqual([
      expect.objectContaining({
        date: "2025-08-18",
        amount: "250.64",
        kind: "buy",
        runningBalanceAfter: "119084.00",
      }),
    ]);
  });

  it("dedups re-importing the same transactions-only Document (Hapoalim's rolling window)", async () => {
    const account = await createTestAccount();
    const asset = await createAsset({ type: "mutual_fund", name: "Money Market" });
    const parsedData = {
      transactions: [
        {
          date: "18/08/2025",
          assetName: "Money Market Fund",
          kind: "buy",
          amount: "250.64",
          currency: "ILS",
        },
      ],
    };

    const firstDocument = await createProcessingDocument(account.id);
    await commitSnapshot(firstDocument.id, account.id, parsedData, [asset.id]);

    const secondDocument = await createProcessingDocument(account.id);
    const result = await commitSnapshot(secondDocument.id, account.id, parsedData, [asset.id]);

    expect(result).toEqual({ ok: true });
    await expect(findCashFlowsForAsset(asset.id)).resolves.toHaveLength(1);
  });

  it("treats a matching row with a different runningBalanceAfter as distinct, not a dup", async () => {
    const account = await createTestAccount();
    const asset = await createAsset({ type: "etf", name: "S&P 500" });
    const baseTransaction = {
      date: "18/08/2025",
      assetName: "S&P 500",
      kind: "buy",
      amount: "250.64",
      currency: "ILS",
    };

    const firstDocument = await createProcessingDocument(account.id);
    await commitSnapshot(
      firstDocument.id,
      account.id,
      { transactions: [{ ...baseTransaction, balanceAfter: "1000.00" }] },
      [asset.id],
    );

    const secondDocument = await createProcessingDocument(account.id);
    await commitSnapshot(
      secondDocument.id,
      account.id,
      { transactions: [{ ...baseTransaction, balanceAfter: "2000.00" }] },
      [asset.id],
    );

    await expect(findCashFlowsForAsset(asset.id)).resolves.toHaveLength(2);
  });

  // ADR-0023/#39 — Gemel period-aggregate derivation.
  it("derives correctly-signed/kinded cash_flows from a Gemel-shaped commit's period-aggregate fields", async () => {
    const account = await createTestAccount();
    const document = await createProcessingDocument(account.id);
    const asset = await createAsset({ type: "mutual_fund", name: "Pension Fund" });

    const result = await commitSnapshot(
      document.id,
      account.id,
      {
        asOfDate: "31.12.2025",
        holdings: [{ assetName: "Pension Fund", quantity: "1", value: "50000", currency: "ILS" }],
        deposits: "10000.0",
        transfers: "20000.0",
        withdrawals: "-500.0",
        transfersOut: "-300.0",
      },
      [asset.id],
    );

    expect(result).toEqual({ ok: true });
    const flows = await findCashFlowsForAsset(asset.id);
    expect(flows).toHaveLength(4);
    expect(flows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "deposit", amount: "10000.0", date: "2025-12-31" }),
        expect.objectContaining({ kind: "transfer_in", amount: "20000.0" }),
        expect.objectContaining({ kind: "withdrawal", amount: "-500.0" }),
        expect.objectContaining({ kind: "transfer_out", amount: "-300.0" }),
      ]),
    );
    expect(flows.every((f) => f.source === "derived_period_aggregate")).toBe(true);
  });

  it("skips zero-valued and absent Gemel period-aggregate fields", async () => {
    const account = await createTestAccount();
    const document = await createProcessingDocument(account.id);
    const asset = await createAsset({ type: "mutual_fund", name: "Pension Fund" });

    await commitSnapshot(
      document.id,
      account.id,
      {
        asOfDate: "31.12.2025",
        holdings: [{ assetName: "Pension Fund", quantity: "1", value: "10000", currency: "ILS" }],
        deposits: null,
        transfers: "0.0",
        withdrawals: "0.0",
        transfersOut: "0.0",
      },
      [asset.id],
    );

    await expect(findCashFlowsForAsset(asset.id)).resolves.toEqual([]);
  });

  it("skips Gemel derivation when there isn't exactly one holding", async () => {
    const account = await createTestAccount();
    const document = await createProcessingDocument(account.id);

    await commitSnapshot(
      document.id,
      account.id,
      { asOfDate: "31.12.2025", holdings: [], deposits: "10000.0" },
      [],
    );

    await expect(findDocumentById(document.id)).resolves.toEqual(
      expect.objectContaining({ status: "committed" }),
    );
  });

  // ADR-0023/#39 — Excellence cost-basis-delta derivation.
  it("derives nothing from a first Excellence Snapshot for a holding (no prior to diff)", async () => {
    const account = await createTestAccount();
    const document = await createProcessingDocument(account.id);
    const asset = await createAsset({ type: "etf", name: "S&P 500" });

    await commitSnapshot(
      document.id,
      account.id,
      {
        asOfDate: "30.09.2024",
        holdings: [
          {
            assetName: "S&P 500",
            quantity: "4.00",
            value: "16720.00",
            currency: "ILS",
            purchaseCostIls: 16359.52,
          },
        ],
      },
      [asset.id],
    );

    await expect(findCashFlowsForAsset(asset.id)).resolves.toEqual([]);
  });

  it("derives a correctly-signed cost_basis_delta from a second Excellence Snapshot", async () => {
    const account = await createTestAccount();
    const asset = await createAsset({ type: "etf", name: "S&P 500" });

    const firstDocument = await createProcessingDocument(account.id);
    await commitSnapshot(
      firstDocument.id,
      account.id,
      {
        asOfDate: "30.06.2024",
        holdings: [
          { assetName: "S&P 500", quantity: "3.00", value: "12000.00", currency: "ILS", purchaseCostIls: 12000 },
        ],
      },
      [asset.id],
    );

    const secondDocument = await createProcessingDocument(account.id);
    const result = await commitSnapshot(
      secondDocument.id,
      account.id,
      {
        asOfDate: "30.09.2024",
        holdings: [
          { assetName: "S&P 500", quantity: "4.00", value: "16720.00", currency: "ILS", purchaseCostIls: 16359.52 },
        ],
      },
      [asset.id],
    );

    expect(result).toEqual({ ok: true });
    const flows = await findCashFlowsForAsset(asset.id);
    expect(flows).toEqual([
      expect.objectContaining({
        kind: "cost_basis_delta",
        amount: "4359.52",
        date: "2024-09-30",
        source: "derived_cost_basis_delta",
      }),
    ]);
  });

  it("does not derive a cost_basis_delta when the document also has real transactions (double-count guard)", async () => {
    const account = await createTestAccount();
    const asset = await createAsset({ type: "etf", name: "S&P 500" });

    const firstDocument = await createProcessingDocument(account.id);
    await commitSnapshot(
      firstDocument.id,
      account.id,
      {
        asOfDate: "30.06.2024",
        holdings: [
          { assetName: "S&P 500", quantity: "3.00", value: "12000.00", currency: "ILS", purchaseCostIls: 12000 },
        ],
      },
      [asset.id],
    );

    const secondDocument = await createProcessingDocument(account.id);
    await commitSnapshot(
      secondDocument.id,
      account.id,
      {
        asOfDate: "30.09.2024",
        holdings: [
          { assetName: "S&P 500", quantity: "4.00", value: "16720.00", currency: "ILS", purchaseCostIls: 16359.52 },
        ],
        transactions: [
          { date: "30/09/2024", assetName: "S&P 500", kind: "buy", amount: "4180.0", currency: "ILS" },
        ],
      },
      [asset.id, asset.id],
    );

    const flows = await findCashFlowsForAsset(asset.id);
    expect(flows).toHaveLength(1);
    expect(flows[0]).toEqual(expect.objectContaining({ kind: "buy", source: "ingested_transaction" }));
  });

  it("dedups re-importing the same Excellence Snapshot (no duplicate cost_basis_delta)", async () => {
    const account = await createTestAccount();
    const asset = await createAsset({ type: "etf", name: "S&P 500" });
    const firstData = {
      asOfDate: "30.06.2024",
      holdings: [
        { assetName: "S&P 500", quantity: "3.00", value: "12000.00", currency: "ILS", purchaseCostIls: 12000 },
      ],
    };
    const secondData = {
      asOfDate: "30.09.2024",
      holdings: [
        { assetName: "S&P 500", quantity: "4.00", value: "16720.00", currency: "ILS", purchaseCostIls: 16359.52 },
      ],
    };

    const firstDocument = await createProcessingDocument(account.id);
    await commitSnapshot(firstDocument.id, account.id, firstData, [asset.id]);
    const secondDocument = await createProcessingDocument(account.id);
    await commitSnapshot(secondDocument.id, account.id, secondData, [asset.id]);

    const thirdDocument = await createProcessingDocument(account.id);
    const result = await commitSnapshot(thirdDocument.id, account.id, secondData, [asset.id]);

    expect(result).toEqual({ ok: true });
    await expect(findCashFlowsForAsset(asset.id)).resolves.toHaveLength(1);
  });
});

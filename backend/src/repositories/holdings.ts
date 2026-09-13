import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { accounts, assets, documents, holdings, institutions } from "../db/schema.js";

export interface LatestHoldingRow {
  accountId: string;
  assetId: string;
  assetName: string;
  assetTicker: string | null;
  assetType: string;
  quantity: string;
  value: string;
  currency: string;
  asOfDate: string | null;
}

// One row per (account, asset actually reported) — sourced from each
// Account's single most-recent committed Document. An Asset with
// quantity="0" here means fully sold as of that Document; an Asset never
// appearing in any Account's latest Document (whether never held, or held
// then dropped from a later statement without an explicit zero row) isn't
// returned at all — see services/holdings.ts for how that's turned into
// HoldingRow[].
export async function listLatestHoldings(): Promise<LatestHoldingRow[]> {
  // The latest committed Document per Account — ranked by asOfDate (falling
  // back to uploadedAt for Documents where the statement's own date wasn't
  // extracted, e.g. a still-pending privacy-preflight review).
  const latestDocumentPerAccount = db
    .select({
      accountId: documents.accountId,
      documentId: documents.id,
      asOfDate: documents.asOfDate,
      rank: sql<number>`row_number() over (
        partition by ${documents.accountId}
        order by coalesce(${documents.asOfDate}, ${documents.uploadedAt}::date) desc
      )`.as("rank"),
    })
    .from(documents)
    .where(eq(documents.status, "committed"))
    .as("latest_document_per_account");

  const rows = await db
    .select({
      accountId: latestDocumentPerAccount.accountId,
      assetId: holdings.assetId,
      assetName: assets.name,
      assetTicker: assets.ticker,
      assetType: assets.type,
      quantity: holdings.quantity,
      value: holdings.value,
      currency: holdings.currency,
      asOfDate: latestDocumentPerAccount.asOfDate,
    })
    .from(latestDocumentPerAccount)
    .innerJoin(holdings, eq(holdings.documentId, latestDocumentPerAccount.documentId))
    .innerJoin(assets, eq(assets.id, holdings.assetId))
    .where(eq(latestDocumentPerAccount.rank, 1));

  return rows;
}

export interface CommittedDocumentRow {
  documentId: string;
  accountId: string;
  institutionName: string;
  asOfDate: string | null;
  uploadedAt: Date;
}

// Every committed Document across every Account, oldest first — the event
// timeline services/holdings.ts's Net Worth history is built from.
export async function listCommittedDocuments(): Promise<CommittedDocumentRow[]> {
  return db
    .select({
      documentId: documents.id,
      accountId: documents.accountId,
      institutionName: institutions.name,
      asOfDate: documents.asOfDate,
      uploadedAt: documents.uploadedAt,
    })
    .from(documents)
    .innerJoin(accounts, eq(accounts.id, documents.accountId))
    .innerJoin(institutions, eq(institutions.id, accounts.institutionId))
    .where(eq(documents.status, "committed"))
    .orderBy(asc(sql`coalesce(${documents.asOfDate}, ${documents.uploadedAt}::date)`));
}

export interface HoldingLine {
  assetId: string;
  quantity: string;
  value: string;
  currency: string;
}

export async function listHoldingsForDocument(documentId: string): Promise<HoldingLine[]> {
  return db
    .select({
      assetId: holdings.assetId,
      quantity: holdings.quantity,
      value: holdings.value,
      currency: holdings.currency,
    })
    .from(holdings)
    .where(eq(holdings.documentId, documentId));
}

export interface HoldingHistoryRow {
  accountId: string;
  quantity: string;
  value: string;
  currency: string;
  asOfDate: string | null;
  uploadedAt: Date;
}

// Every committed Document that has ever reported this Asset, oldest first
// — used to detect "closed" (a later Document exists with quantity 0) and
// to date-bound heldFrom/heldTo alongside transactions.
export async function listHoldingHistoryForAsset(assetId: string): Promise<HoldingHistoryRow[]> {
  return db
    .select({
      accountId: documents.accountId,
      quantity: holdings.quantity,
      value: holdings.value,
      currency: holdings.currency,
      asOfDate: documents.asOfDate,
      uploadedAt: documents.uploadedAt,
    })
    .from(holdings)
    .innerJoin(documents, eq(documents.id, holdings.documentId))
    .where(eq(holdings.assetId, assetId))
    .orderBy(desc(documents.uploadedAt));
}

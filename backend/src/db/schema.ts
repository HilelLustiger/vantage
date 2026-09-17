import {
  pgTable,
  text,
  timestamp,
  json,
  jsonb,
  numeric,
  date,
  primaryKey,
} from "drizzle-orm/pg-core";
import type {
  AssetType,
  DocumentLine,
  DocumentStatus,
  ExtractedLine,
  TransactionKind,
  ValidityCheckResult,
} from "../dto/index.js";

// Backend-internal — never exposed to web as-is (see getDocumentReview in
// services/documents.ts, which strips identityValues before returning the
// content_review case as a DocumentReview). Lives in its own table, not on
// `documents` itself, so that table holds only finished/stable Document
// state — this row exists only while status is "needs_review" and is
// deleted once the Document moves past it.
export type PendingReview =
  | {
      reason: "content_review";
      lines: DocumentLine[];
      pageWidth: number;
      pageHeight: number;
      identityValues: Record<string, string | null>;
    }
  | { reason: "extraction_review"; lines: ExtractedLine[]; failedChecks: ValidityCheckResult[] };

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type UserRow = typeof users.$inferSelect;

// Schema required by connect-pg-simple: https://github.com/voxpelli/node-connect-pg-simple#table-schema
// Not queried through drizzle — connect-pg-simple manages this table itself.
export const session = pgTable("session", {
  sid: text("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6, withTimezone: false }).notNull(),
});

export const institutions = pgTable("institutions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
});
export type InstitutionRow = typeof institutions.$inferSelect;

export const accounts = pgTable("accounts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  institutionId: text("institution_id")
    .notNull()
    .references(() => institutions.id),
});
export type AccountRow = typeof accounts.$inferSelect;

// Many-to-many: Account.ownerUserIds is an array in the DTO.
export const accountOwners = pgTable(
  "account_owners",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.accountId, t.userId] }) }),
);
export type AccountOwnerRow = typeof accountOwners.$inferSelect;

export const assets = pgTable("assets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  type: text("type").$type<AssetType>().notNull(),
  name: text("name").notNull(),
  ticker: text("ticker"),
  isin: text("isin"),
  securityNumber: text("security_number"),
});
export type AssetRow = typeof assets.$inferSelect;

// One row per uploaded statement — only finished/stable state, never an
// in-progress review payload (see documentPendingReviews below).
export const documents = pgTable("documents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  status: text("status").$type<DocumentStatus>().notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  failureReason: text("failure_reason"),
  // Identifies a re-upload of the same file, for DocumentStatus "duplicate".
  checksum: text("checksum").notNull(),
  // The statement's own stated date — distinct from uploadedAt, and what a
  // committed Document's Holdings are "as of" for Freshness purposes.
  asOfDate: date("as_of_date"),
});
export type DocumentRow = typeof documents.$inferSelect;
export type DocumentInsert = typeof documents.$inferInsert;

// One row per Document currently in needs_review — deleted once the
// Document moves past it (committed or failed). See the PendingReview type
// above for why this is its own table rather than more nullable columns on
// `documents`.
export const documentPendingReviews = pgTable("document_pending_reviews", {
  documentId: text("document_id")
    .primaryKey()
    .references(() => documents.id),
  payload: jsonb("payload").$type<PendingReview>().notNull(),
});
export type DocumentPendingReviewRow = typeof documentPendingReviews.$inferSelect;

// What one Document stated: this Asset's quantity/value as of that
// Document's asOfDate. HoldingRow's current value/freshness/history are all
// derived by reading across a given Account+Asset's Documents.
export const holdings = pgTable("holdings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id),
  assetId: text("asset_id")
    .notNull()
    .references(() => assets.id),
  quantity: numeric("quantity").notNull(),
  value: numeric("value").notNull(),
  currency: text("currency").notNull(),
});
// Named HoldingTableRow, not HoldingRow — that name is already the DTO's
// (dto/holdings.ts) for the Assets table's fully-resolved row; this is the
// raw DB row long before it's assembled into one.
export type HoldingTableRow = typeof holdings.$inferSelect;
export type HoldingInsert = typeof holdings.$inferInsert;

// An internal ledger, never exposed to web directly — the only way to
// compute OpenHoldingDetail.xirr (money-weighted return needs dated cash
// flows, not just point-in-time snapshots) and ClosedHoldingDetail's
// heldFrom/heldTo/soldFor/realizedProfit (a specific sale event, not
// derivable from Holdings alone).
export const transactions = pgTable("transactions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  assetId: text("asset_id")
    .notNull()
    .references(() => assets.id),
  occurredAt: date("occurred_at").notNull(),
  quantityDelta: numeric("quantity_delta").notNull(),
  amount: numeric("amount").notNull(),
  currency: text("currency").notNull(),
  kind: text("kind").$type<TransactionKind>().notNull(),
});
export type TransactionRow = typeof transactions.$inferSelect;
export type TransactionInsert = typeof transactions.$inferInsert;

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
  DocumentStatus,
  ExtractedLine,
  LocallyConfirmedFields,
  ValidityCheckResult,
} from "../dto/index.js";

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

// One row per uploaded statement. `asOfDate`/`parsedLines`/`locallyConfirmed`/
// `validityFailedChecks` are populated once parsing (or the privacy
// preflight check) has run — null until then. DocumentReview's `reason` is
// derived from which of these is populated, not stored separately.
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
  parsedLines: jsonb("parsed_lines").$type<ExtractedLine[]>(),
  locallyConfirmed: jsonb("locally_confirmed").$type<LocallyConfirmedFields>(),
  validityFailedChecks: jsonb("validity_failed_checks").$type<ValidityCheckResult[]>(),
});
export type DocumentRow = typeof documents.$inferSelect;
export type DocumentInsert = typeof documents.$inferInsert;

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

export type TransactionKind = "buy" | "sell" | "deposit" | "withdrawal";

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

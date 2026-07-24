import {
  pgTable,
  text,
  timestamp,
  json,
  primaryKey,
  date,
  boolean,
  numeric,
  unique,
  index,
} from "drizzle-orm/pg-core";
import type {
  AssetType,
  CashFlowSource,
  DocumentFeature,
  DocumentFormat,
  DocumentStatus,
} from "@vantage/shared-types";

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Schema required by connect-pg-simple: https://github.com/voxpelli/node-connect-pg-simple#table-schema
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

export const accounts = pgTable("accounts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  institutionId: text("institution_id")
    .notNull()
    .references(() => institutions.id),
  name: text("name").notNull(),
});

// An Account can have several owning Users (joint), a User can own several
// Accounts. Mirrors shared-types' Account.ownerUserIds.
export const accountUsers = pgTable(
  "account_users",
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

export const assets = pgTable("assets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  type: text("type").notNull().$type<AssetType>(),
  name: text("name").notNull(),
  ticker: text("ticker"),
  isin: text("isin"),
  // TASE (or equivalent exchange) security number — a real Asset-matching
  // key alongside ticker/isin, see ADR-0024.
  securityNumber: text("security_number"),
});

export const documents = pgTable("documents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  status: text("status").notNull().$type<DocumentStatus>(),
  checksum: text("checksum").notNull(),
  format: text("format").notNull().$type<DocumentFormat>().default("pdf"),
  feature: text("feature")
    .notNull()
    .$type<DocumentFeature>()
    .default("investments"),
  dateRangeStart: date("date_range_start", { mode: "string" }),
  dateRangeEnd: date("date_range_end", { mode: "string" }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Raw parser-service output on a successful parse — internal only, never
  // exposed on the Document wire type (see toDocument()). #20/#21 consume
  // this to drive processing -> needs_review/committed.
  parsedData: json("parsed_data"),
  // The parser service's `reason` string on a failed parse. Short and
  // non-PII, safe to expose on Document (unlike parsedData).
  failureReason: text("failure_reason"),
  // Per-holding Asset match results from #20 — a (string | null)[],
  // positionally aligned with parsedData's holdings array. Internal only,
  // same reasoning as parsedData; #21/#10 consume this.
  resolvedHoldings: json("resolved_holdings"),
});

// See docs/ADR/0009-snapshot-immutability-and-supersede.md: immutable once
// created, a re-import for the same Account+date supersedes rather than
// overwrites. supersededBySnapshotId has no .references() — it's a nullable
// self-reference to a row that doesn't exist yet at insert time; enforced
// at the app layer (ingest/snapshotCreation.ts) instead of a deferred FK.
export const snapshots = pgTable("snapshots", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id),
  asOfDate: date("as_of_date", { mode: "string" }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  supersededBySnapshotId: text("superseded_by_snapshot_id"),
});

// See docs/ADR/0012-multi-currency-store-original-convert-at-read.md:
// value stored in whatever currency was parsed, never converted at write
// time. quantity/value use `numeric`, not `text` — a real Postgres numeric
// type, while drizzle's default mode still returns a string, matching
// Holding.quantity/value's shared-types shape exactly.
export const holdings = pgTable("holdings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  snapshotId: text("snapshot_id")
    .notNull()
    .references(() => snapshots.id),
  assetId: text("asset_id")
    .notNull()
    .references(() => assets.id),
  quantity: numeric("quantity").notNull(),
  value: numeric("value").notNull(),
  currency: text("currency").notNull(),
});

// See docs/ADR/0023-per-asset-cash-flow-tracking-and-return-metrics.md:
// a dated cash-flow event for one Asset, aggregated cross-account at read
// time (not partitioned by account) — accountId/documentId are kept here
// purely for traceability and dedup, not as a query boundary. Append-only,
// same immutability precedent as Snapshot (ADR-0009) — corrections append
// new rows, nothing is ever rewritten. Dedup (composite natural key: date
// + assetId + kind + amount + runningBalanceAfter) is enforced at the
// application layer, not a DB constraint — runningBalanceAfter is
// nullable, and SQL UNIQUE never treats NULLs as equal, so a DB
// constraint would silently miss duplicates for exactly the rows most
// likely to lack it (derived_period_aggregate/derived_cost_basis_delta).
export const cashFlows = pgTable(
  "cash_flows",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id),
    date: date("date", { mode: "string" }).notNull(),
    // Signed: positive = contributed/bought, negative = withdrawn/sold —
    // flipped to finance convention only at XIRR computation time.
    amount: numeric("amount").notNull(),
    currency: text("currency").notNull(),
    kind: text("kind").notNull(),
    source: text("source").notNull().$type<CashFlowSource>(),
    runningBalanceAfter: numeric("running_balance_after"),
  },
  (t) => ({
    assetDateIdx: index("cash_flows_asset_date_idx").on(t.assetId, t.date),
  }),
);

// See docs/ADR/0012-multi-currency-store-original-convert-at-read.md: a
// local cache of fetched Frankfurter rates, keyed by the *requested* date
// (not whatever nearby trading day Frankfurter substitutes internally) so
// repeated lookups for the same date are predictable and hit the cache.
// Purely backend infrastructure — never part of shared-types/the wire.
export const fxRates = pgTable(
  "fx_rates",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    date: date("date", { mode: "string" }).notNull(),
    fromCurrency: text("from_currency").notNull(),
    toCurrency: text("to_currency").notNull(),
    rate: numeric("rate").notNull(),
  },
  (t) => ({ unique: unique().on(t.date, t.fromCurrency, t.toCurrency) }),
);

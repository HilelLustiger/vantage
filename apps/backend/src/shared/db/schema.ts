import { pgTable, text, timestamp, json, primaryKey, date } from "drizzle-orm/pg-core";
import type {
  AssetType,
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
});

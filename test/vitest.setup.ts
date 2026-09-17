import path from "node:path";
import dotenv from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { beforeAll } from "vitest";

// npm runs this workspace's scripts with cwd = test/, so the root .env is one
// level up. No-ops quietly if the file doesn't exist (e.g. real env already
// set, as in CI).
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

// Integration tests must never run against the same database as `docker
// compose up`'s dev instance: each test generates a fresh randomUUID() user/
// institution/account rather than cleaning up after itself (by design, so
// runs never collide with leftover rows from a previous run) — pointed at
// the real dev DB, that leaves permanent cruft behind on every `npm test`.
// Redirect at a same-server, disposable `<name>_test` database instead,
// created and migrated fresh below. This must run before any test file's own
// imports pull in @vantage/backend's db client, which reads DATABASE_URL at
// module-load time — setup files fully execute before the test file that
// uses them is imported, so reassigning it here (synchronously, at the top
// level) takes effect in time.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}
const devUrl = new URL(process.env.DATABASE_URL);
// .env's DATABASE_URL uses the `postgres` compose-network hostname, which
// only resolves for containers on that network — not for tests run from the
// host shell. docker-compose.yml already maps the same Postgres to
// localhost:5433 for exactly this case; CI sets DATABASE_URL directly
// (already `localhost`), so this only fires for the host/.env path.
if (devUrl.hostname === "postgres") {
  devUrl.hostname = "localhost";
  devUrl.port = "5433";
}
const testDbName = `${devUrl.pathname.slice(1)}_test`;
const testUrl = new URL(devUrl);
testUrl.pathname = `/${testDbName}`;
process.env.DATABASE_URL = testUrl.toString();

beforeAll(async () => {
  const quotedDbName = `"${testDbName.replace(/"/g, '""')}"`;
  const admin = new Pool({ connectionString: devUrl.toString() });
  try {
    await admin.query(`CREATE DATABASE ${quotedDbName}`);
  } catch (err) {
    // 42P04 = duplicate_database — already created by an earlier run.
    if (!(err instanceof Error) || !("code" in err) || err.code !== "42P04") {
      throw err;
    }
  } finally {
    await admin.end();
  }

  const testPool = new Pool({ connectionString: testUrl.toString() });
  await migrate(drizzle(testPool), {
    migrationsFolder: path.resolve(process.cwd(), "../backend/src/db/migrations"),
  });
  // Start every run from a clean slate — bounds disk/row growth on the test
  // database itself instead of just relocating the original problem.
  await testPool.query(`
    TRUNCATE TABLE
      transactions, holdings, document_pending_reviews, documents,
      account_owners, accounts, institutions, assets, session, users
    RESTART IDENTITY CASCADE
  `);
  await testPool.end();
});

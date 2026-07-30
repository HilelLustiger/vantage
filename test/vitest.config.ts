import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // Serialize test files: vitest.setup.ts creates/migrates the shared
    // `<db>_test` database on every file's beforeAll, which isn't safe for
    // concurrent first-run races (CREATE DATABASE, migrations table writes).
    fileParallelism: false,
  },
});

import path from "node:path";
import dotenv from "dotenv";

// npm runs this workspace's scripts with cwd = test/, so the root .env is one
// level up. No-ops quietly if the file doesn't exist (e.g. real env already
// set, as in CI).
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

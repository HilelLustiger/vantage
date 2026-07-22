import { createServer, type Server } from "node:http";
import path from "node:path";
import dotenv from "dotenv";
import { afterAll, beforeAll } from "vitest";

// npm runs this workspace's scripts with cwd = test/, so the root .env is one
// level up. No-ops quietly if the file doesn't exist (e.g. real env already
// set, as in CI).
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

// Integration tests exercise the real ingest -> parser HTTP call (#22) but
// shouldn't depend on the actual Python service (or docker) being up. A
// minimal stand-in that always reports a successful, empty parse exercises
// the real request/response wire format; PARSER_URL is pointed at it for
// this run, overriding whatever .env/CI set. `holdings: []` (not `{}`) so
// #20's asset-resolution step, which validates this shape, doesn't reject
// it as malformed.
let fakeParser: Server;

beforeAll(async () => {
  fakeParser = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, data: { holdings: [] } }));
  });
  await new Promise<void>((resolve) => fakeParser.listen(0, resolve));
  const { port } = fakeParser.address() as { port: number };
  process.env.PARSER_URL = `http://localhost:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    fakeParser.close((err) => (err ? reject(err) : resolve())),
  );
});

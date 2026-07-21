# backend

Single Node service, two internal modules with a defined boundary between them
(in-process calls, no network hop):

- `src/api` — auth, sessions, all CRUD, Snapshot/Holding/Portfolio queries, Document upload intake. See milestone M2.
- `src/ingest` — Document state machine, parser dispatch registry, Snapshot/Holding creation. See milestone M3.
- `src/shared` — cross-cutting concerns used by both (DB access, auth middleware, etc.).

Makes exactly one external hop, to `parser`.

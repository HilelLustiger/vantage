# 0002: Single backend service, with internal API / Ingest module split

## Status

Accepted — 2026-07-21

## Context

Vantage's backend needs two distinct concerns: serving the API (auth, sessions,
CRUD, Snapshot/Holding/Portfolio queries, Document upload intake) and running
import processing (the Document state machine, parser dispatch, Snapshot/Holding
creation from parsed data). `docs/decisions.md` originally specified a single
Node "app container" for the whole backend, with a separate Python container
only for PDF parsing (a genuine language/ecosystem boundary — Python's PDF
tooling is materially better than anything in Node).

While setting up the repo, the request to keep API logic and import-processing
logic separate was initially read as *two independently deployable services*
(their own containers), mirroring the parser's service boundary. That would
have changed the Docker Compose topology decided in `decisions.md` §4 from
3 containers (app, postgres, parser) to 4.

## Decision

Keep **one Node `backend` service** (confirming, not amending, `decisions.md`
§4), split internally into two modules with a defined boundary:

- `src/api` — auth, sessions, all CRUD (Institution/Account/Asset),
  Snapshot/Holding/Portfolio queries, Document upload intake (the shared
  "front door").
- `src/ingest` — the Document state machine (`Uploaded → Processing →
  NeedsReview/Committed/Failed/Duplicate`), the per-(institution, format)
  parser dispatch registry, and Snapshot/Holding creation once parsing
  succeeds.

`src/api` and `src/ingest` communicate **in-process** — a plain function call /
defined TypeScript interface (e.g. `src/api` calls `ingest.startImport(documentId)`
after storing an upload) — not over a network hop. `backend` still makes
exactly one external hop, to the `parser` service, unchanged from the original
decision.

## Alternatives Considered

**Two separate services (`api` + `ingest`, each its own container).** Rejected:

- No load or independent-scaling need exists for a single-household app that
  runs locally, on demand. The usual reasons to split a service (isolate
  scaling, isolate failure, independent deploys) don't apply here.
- The project's own precedent — splitting out the Python parser — was drawn
  along a *language/ecosystem* boundary. `api` and `ingest` are both plain
  TypeScript; there's no analogous boundary to justify a second Node service.
- Two services sharing one Postgres DB creates an open question with no good
  answer: which codebase owns migrations? A single service avoids that
  question entirely.
- The separation-of-concerns goal is fully achievable with two modules and a
  defined interface in one codebase, without an HTTP contract between them.

**No internal separation (one undifferentiated backend module).** Rejected:
import-processing logic is expected to grow in complexity as more
institution/format parsers are added (see
[0014 — Per-(institution, format) parser registry](0014-parser-registry-generic-dispatch.md)),
and tangling it with request-handling code would make both harder to test and
reason about independently.

## Consequences

- Simpler ops: one container to build, run, and redeploy for all backend
  logic; one migration owner; simpler local dev (no second Node process to
  run/debug).
- The `src/api` ↔ `src/ingest` interface must be treated as a real, deliberate
  contract (tracked as an M0 issue), not left implicit — that's what keeps the
  modules decoupled despite living in one process.
- If import-processing later becomes CPU/memory-heavy enough to want
  independent scaling or independent restarts from the API, this decision
  should be revisited — splitting an already well-bounded module out later is
  a smaller lift than starting split and getting the boundary wrong.

## Related

- [0001 — System Architecture](0001-system-architecture.md) — elaborated here, not superseded
- [0003 — Separate Python parsing service](0003-separate-python-parsing-service.md) — the precedent this ADR argues *doesn't* extend to `api`/`ingest`
- `docs/DOMAIN.md` — added the **Ingest** term
- GitHub milestones **M2 — API module** and **M3 — Ingest module**, and the M0
  issue "Define the api <-> ingest in-process interface", in
  `HilelLustiger/vantage`

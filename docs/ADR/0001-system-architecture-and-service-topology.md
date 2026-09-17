# 0001: System architecture & service topology

## Status

Accepted — 2026-09-10 (consolidates the original 0001-system-architecture,
0002-single-backend-service-with-api-ingest-modules, 0003-separate-python-parsing-service,
and 0027-service-topology-orchestrator-and-stateless-parser)

## Context

Vantage is a private financial tracking platform for a single household. It
needs to store and query a growing amount of financial data (Snapshots,
Holdings, Documents) reliably, run comfortably on a single machine, and be
buildable by one person without a large ops surface. Turning a PDF statement
into structured rows is a genuinely hard parsing problem, and Python's
ecosystem for it (pdfplumber, camelot, pandas) is materially more mature
than anything in Node — a real, narrow language/ecosystem boundary, not a
scaling need.

That topology held until the parser-generalization/AI-extraction work
(0008 in this renumbering) introduced a reason the original split never
considered: **security isolation**. Once the parsing service calls an
external LLM for part of extraction, which process holds both a raw,
unredacted document and a database connection stops being an ops-convenience
question and becomes a blast-radius question.

## Decision

**Tech stack**: TypeScript end-to-end (Node backend + TypeScript/React
frontend) + PostgreSQL, containerized with Docker Compose, hosted **locally**
on the household's own machine — not a dedicated home server, not
cloud-hosted, started on demand.

**Services:**

- **`web`** — frontend, renders `backend`.
- **`backend`** — the only service with database access. Owns every
  persistent domain entity (`Document`, `Snapshot`, `Holding`, `Asset`,
  `Account`, ...) and decides every state transition. Calls `parser` with a
  document and whatever context `parser` needs; writes whatever `parser`
  computes. Deliberately kept thin — no document-processing logic lives
  here.
- **`parser`** (Python) — the sole cross-language service boundary, and the
  only genuinely necessary one (contrast: `api`/`ingest` concerns inside
  `backend` are both plain TypeScript, with no analogous ecosystem boundary,
  so they stay one process, not two). **Stateless — no database access at
  all.** Receives a raw document plus context (e.g. the current `Asset`
  registry, for matching) and returns a finished result: extracted fields,
  resolved holdings, computed Snapshot/Holding values, or a failure reason.
  Runs as a minimal, always-on HTTP service with zero exposed ports —
  reachable only by `backend`, over the internal Docker network, never
  exposed to the host or wider network. (Idle cost of an always-on service
  is negligible next to Postgres already being in the stack, given the
  whole app only runs when the household is using it; a per-request
  spun-up container, or Docker-socket access letting `backend` control the
  Docker daemon directly, were both rejected as unneeded complexity and a
  security smell, respectively.)

Two independent justifications for `parser`'s statelessness, not one:

1. **Architectural** — `backend` stays the single source of truth for all
   data; `parser` is a pure function with no side effects on shared state.
2. **Security, defense in depth** — `parser` is the only component that ever
   sees a raw document and the only one that ever talks to an external LLM
   (0008 in this renumbering). Holding no DB credentials means a
   compromised `parser` (malicious PDF, vulnerable dependency) is bounded to
   the one document it was handed, not the whole database.

**Access model**: open/deferred — how a second household member (or a
phone) connects is not yet decided (LAN access, or Tailscale for remote
access without exposing the app publicly, are both candidates), and is
deliberately decoupled from the auth mechanism (see 0003 in this
renumbering) so it can be added later without reworking auth.

A dedicated pricing/market-data service (for live prices, see 0005 in this
renumbering) was considered and explicitly not committed to — `backend`
calls a market-data API directly by default; only worth splitting out if
that logic gets complex enough to justify its own service.

## Alternatives Considered

- **Cloud hosting** — rejected as out of scope; not a SaaS product (0002 in
  this renumbering), and cloud hosting adds cost, complexity, and a new
  threat model for no benefit to a single household running the app on
  demand.
- **Non-TypeScript backend** — rejected; one language across
  frontend/backend reduces context-switching for a solo developer, with
  Python carved out only where it has a genuine ecosystem advantage.
- **Do PDF parsing in Node/TypeScript** — rejected; materially weaker
  tooling for the hardest part of the import pipeline, on data where a
  silent misread is the worst possible failure mode.
- **Keep `ingest` logic inside `backend`** (the original 0002 status quo) —
  rejected once `parser` needed to call an external LLM: the blast-radius
  problem exists whether or not there's a scaling need. The original
  reasons for keeping it in `backend` (no independent-scaling need, no
  language boundary, single migration owner) are all still true and still
  argue against splitting _for ops reasons_ — they just don't address the
  security reason, which wasn't in play originally.
- **Give `parser` its own read-only DB credentials** (e.g. for `Asset`
  matching) — rejected: keeps the blast-radius problem alive in smaller
  form. `backend` passing whatever context `parser` needs as part of the
  request is a larger payload but a strictly smaller trust surface.

## Consequences

- Adding remote/multi-user access later is an open question (see the ADR
  index) but shouldn't require reworking login.
- Running locally means no CI/CD deployment step; CI validates code quality
  only, never deploys. Backup/disaster-recovery and encryption-at-rest
  remain open questions (see the ADR index).
- `backend`'s call to `parser` carries more than "here's a file" — it's
  "here's a file, here's the current Asset registry, here's whatever else
  you need to fully resolve this." The exact wire contract is implementation
  work, not fixed by this ADR.
- The `Document` domain entity (state machine, see 0004 in this
  renumbering) stays in `backend` — it decides transitions from `parser`'s
  response; it does not delegate the decision to `parser`.
- Adding a new institution/format parser doesn't require touching this
  service boundary — only the registry (0007 in this renumbering).

## Related

- 0002 — Product scope & governance
- 0003 — Auth & secrets
- 0004 — Domain model core
- 0007 — Ingestion pipeline architecture
- 0008 — Parser generalization & AI-assisted extraction

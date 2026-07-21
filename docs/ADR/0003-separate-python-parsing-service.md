# 0003: Separate Python parsing service

## Status

Accepted — 2026-07-21

## Context

Turning a PDF statement's holdings table into structured rows is a genuinely
hard parsing problem. The rest of Vantage is TypeScript
([0001](0001-system-architecture.md)), but Python's ecosystem for this
specific problem (pdfplumber, camelot, pandas) is meaningfully more mature
than anything available in Node.

## Decision

A **separate Python service** (`parser`), its own Docker container, handles
all PDF parsing/extraction:

- A **minimal, always-running (while the app is up) HTTP service** with a
  single internal endpoint (`POST /parse`) — not a per-request spun-up
  container, and not a script invoked via Docker-socket access. Idle resource
  cost is negligible compared to Postgres already being in the stack, given
  the whole app only runs when the household is using it.
- **Zero exposed ports** — reachable only by the `backend` service, over
  Docker's internal network, never exposed to the host or wider network.

## Alternatives Considered

- **Do PDF parsing in Node/TypeScript** — rejected; would mean using
  materially weaker tooling for the hardest part of the import pipeline, on
  financial data where a silent misread is the worst possible failure mode.
- **Docker-socket access (spin up a parsing container per request via the
  Node backend controlling the Docker daemon)** — rejected as a security
  smell: it would grant the app control over the Docker daemon itself, a much
  larger privilege than a parsing service needs.
- **Per-request spun-up container** — rejected as unnecessary complexity;
  since idle cost is negligible for a locally-run app, an always-on service is
  simpler to build, run, and reason about than orchestrating ephemeral
  containers.

## Consequences

- This is the only cross-language service boundary in the system — it exists
  because of a real ecosystem gap, not a scaling need. (Contrast
  [0002](0002-single-backend-service-with-api-ingest-modules.md), where the
  same reasoning is used to argue *against* splitting `api` and `ingest`,
  since no such language boundary exists between them.)
- `backend`'s `ingest` module is the only caller of this service, and the only
  place in `backend` that makes an external network hop.
- Adding a second parser (new institution/format) doesn't require touching
  this service boundary — only the registry described in
  [0014](0014-parser-registry-generic-dispatch.md).

## Related

- [0001 — System Architecture](0001-system-architecture.md)
- [0002 — Single backend service with API/Ingest module split](0002-single-backend-service-with-api-ingest-modules.md)
- [0014 — Per-(institution, format) parser registry](0014-parser-registry-generic-dispatch.md)
- GitHub milestone **M4 — Parser service**, `HilelLustiger/vantage`

# 0001: System architecture — TypeScript + Postgres, Docker Compose, local hosting

## Status

Accepted — 2026-07-21

## Context

Vantage is a private financial tracking platform for a single household. It
needs to store and query a growing amount of financial data (Snapshots,
Holdings, Documents) reliably, run comfortably on a single machine, and be
buildable by one person without a large ops surface.

## Decision

- **Tech stack**: TypeScript end-to-end (Node backend + TypeScript/React
  frontend) + PostgreSQL.
- **Containerization**: Docker Compose, with each service as its own container:
  `web` (frontend), `backend` (Node — see
  [0002](0002-single-backend-service-with-api-ingest-modules.md)), `parser`
  (Python — see [0003](0003-separate-python-parsing-service.md)), `postgres`.
- **Hosting (v1)**: runs **locally**, on the household's own machine, started
  on demand — not a dedicated home server, not cloud-hosted.
- **Access model**: **open / deferred.** How a second household member (or a
  phone, later) connects to the app is not yet decided — candidate options
  discussed include LAN access from another device, or Tailscale for remote
  phone access without exposing the app to the public internet. This is
  deliberately decoupled from the auth mechanism
  ([0017](0017-auth-from-day-one.md)) so the network/access layer can be added
  later without reworking auth.
- **Transactions feature placeholder**: a disabled "Coming soon" nav item in
  the frontend; no real page or logic behind it, since Transactions isn't
  designed yet (see [0006](0006-investments-and-transactions-are-separate-features.md)).

## Alternatives Considered

- **Cloud hosting** — rejected as out of scope for v1; this is explicitly not
  a SaaS product (see [0004](0004-single-household-locally-hosted-scope.md)),
  and cloud hosting would add cost, complexity, and a new threat model for no
  benefit to a single household running the app on demand.
- **Non-TypeScript backend** — rejected; a single language across
  frontend/backend reduces context-switching for a solo developer building
  this alone, with Python carved out only where it has a genuine ecosystem
  advantage (PDF parsing — see [0003](0003-separate-python-parsing-service.md)).

## Consequences

- Adding remote/multi-user access later (LAN, Tailscale, or otherwise) is an
  open question — see the [ADR index](README.md#open-questions) — but the
  auth/access decoupling here means it shouldn't require reworking how users
  log in.
- Running locally means there's no CI/CD deployment step; CI (see the repo's
  `.github/workflows/ci.yml`) validates code quality only, never deploys.
- Backup/disaster-recovery planning and encryption-at-rest are open questions
  (see the [ADR index](README.md#open-questions)), since "runs on one machine"
  raises different risks than a hosted service would.

## Related

- [0002 — Single backend service with API/Ingest module split](0002-single-backend-service-with-api-ingest-modules.md)
- [0003 — Separate Python parsing service](0003-separate-python-parsing-service.md)
- [0004 — Single-household, locally-hosted scope](0004-single-household-locally-hosted-scope.md)
- [0017 — Auth built in from day one](0017-auth-from-day-one.md)
- GitHub milestone **M0 — Scaffolding & Auth**, `HilelLustiger/vantage`

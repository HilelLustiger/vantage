# Architecture Decision Records

This directory is the source of truth for Vantage's foundational design
decisions — it replaces the old `docs/decisions.md`. See
[`docs/DOMAIN.md`](../DOMAIN.md) for the domain glossary, which is kept
separate from decision rationale.

Each ADR captures a decision that was hard to reverse, would be surprising
without context, or was a real trade-off between genuine alternatives — not
every implementation detail gets one.

## Index

| # | Title |
|---|---|
| [0001](0001-system-architecture.md) | System architecture — TypeScript + Postgres, Docker Compose, local hosting |
| [0002](0002-single-backend-service-with-api-ingest-modules.md) | Single backend service, with internal API / Ingest module split |
| [0003](0003-separate-python-parsing-service.md) | Separate Python parsing service |
| [0004](0004-single-household-locally-hosted-scope.md) | Single-household, locally-hosted scope — not a SaaS product |
| [0005](0005-file-import-based-ingestion.md) | File-import-based ingestion, not live institution APIs |
| [0006](0006-investments-and-transactions-are-separate-features.md) | Investments and Transactions are separate features |
| [0007](0007-ai-excluded-from-v1.md) | AI deliberately excluded from v1 |
| [0008](0008-global-asset-registry.md) | Global Asset registry, shared across Accounts |
| [0009](0009-snapshot-immutability-and-supersede.md) | Snapshots are immutable; corrections supersede rather than overwrite |
| [0010](0010-asset-resolution-requires-manual-confirmation.md) | Asset resolution requires manual confirmation, never auto-creates |
| [0011](0011-document-lifecycle-separate-state-machine.md) | Document lifecycle is a separate state machine from Snapshot lifecycle |
| [0012](0012-multi-currency-store-original-convert-at-read.md) | Multi-currency — store original currency, convert at read time |
| [0013](0013-shared-ingestion-front-door.md) | Shared ingestion front door, feature-specific extraction |
| [0014](0014-parser-registry-generic-dispatch.md) | Per-(institution, format) parser registry, generic dispatch |
| [0015](0015-pdf-first-csv-later.md) | PDF first; CSV support planned later, same registry |
| [0016](0016-no-special-backfill-mode.md) | No special "backfill mode" |
| [0017](0017-auth-from-day-one.md) | Auth built in from day one, not deferred |
| [0018](0018-no-third-party-oauth.md) | No third-party OAuth |
| [0019](0019-manual-password-reset.md) | No email-based password reset — manual/CLI reset instead |
| [0020](0020-secrets-and-repo-visibility.md) | Git-ignored .env for secrets; private repo regardless of data sensitivity |

## Open Questions

Not yet resolved — no ADR exists for these because no decision has been made.
Revisit before they become blocking:

- **Backup / disaster recovery** — no plan yet for what happens if the
  machine is lost, stolen, or fails. Candidate: automated periodic backups to
  a physically separate location, encrypted locally before any off-site/cloud
  copy.
- **Encryption at rest** — no application/DB-level encryption yet;
  full-disk encryption (e.g. FileVault) is the pragmatic v1 baseline, not
  currently enabled. Revisit once the app is deployed somewhere with a
  different threat model (e.g. a rented server).
- **Remote / multi-user access model** — how a second household member (or a
  phone) actually connects once it's not just one person on `localhost`. See
  [0001](0001-system-architecture.md) for the access-model framing.
- **Whether CSV import will actually be needed** — unconfirmed for this
  household's specific institutions. See
  [0015](0015-pdf-first-csv-later.md).

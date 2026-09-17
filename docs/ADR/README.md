# Architecture Decision Records

This directory is the source of truth for Vantage's foundational design
decisions. See [`docs/DOMAIN.md`](../DOMAIN.md) for the domain glossary,
kept separate from decision rationale.

Each ADR captures a decision that was hard to reverse, would be surprising
without context, or was a real trade-off between genuine alternatives — not
every implementation detail gets one. As of 2026-09-10, the ADRs below
replace an earlier set of 32 — the earlier ones were too fine-grained
(near-one-per-issue) to serve as a real reference; these consolidate every
decision that's still live into one ADR per genuine subject. Nothing about
the underlying decisions changed in the consolidation — only how they're
grouped and written down. New decisions from here on get their own ADR only
when they clear the bar above; a minor/tooling-level call doesn't need one.

## Index

| #                                                        | Title                                                                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [0001](0001-system-architecture-and-service-topology.md) | System architecture & service topology — TypeScript/Postgres/Python, local hosting, backend orchestrator with a stateless parser |
| [0002](0002-product-scope-and-governance.md)             | Product scope & governance — single-household, Investments-only, public repo                                                     |
| [0003](0003-auth-and-secrets.md)                         | Auth & secrets — built in from day one, no third-party OAuth, manual password reset                                              |
| [0004](0004-domain-model-core.md)                        | Domain model core — Asset registry, Snapshot lifecycle, Document lifecycle, manual asset resolution                              |
| [0005](0005-multi-currency-and-valuation.md)             | Multi-currency and valuation — original currency storage, native display, live vs. document-based Holdings                       |
| [0006](0006-cash-flow-tracking-and-return-metrics.md)    | Cash-flow tracking & return metrics — per-Asset and portfolio-level real profit                                                  |
| [0007](0007-ingestion-pipeline-architecture.md)          | Ingestion pipeline architecture — file import, parser registry, content-driven detection                                         |
| [0008](0008-parser-generalization-and-ai-extraction.md)  | Parser generalization & AI-assisted extraction — declarative templates, two-tier extraction, allowlist/preflight privacy design  |
| [0009](0009-type-and-validation-layering.md)             | Type & validation layering — Zod schemas as the source of truth for wire input, colocated in `dto/`, never hand-duplicated       |

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
  [0001](0001-system-architecture-and-service-topology.md) for the access-model framing.
- **Whether CSV import will actually be needed** — unconfirmed for this
  household's specific institutions. See
  [0007](0007-ingestion-pipeline-architecture.md).
- **LLM provider/self-hosting choice for parser field extraction** — the
  allowlist/preflight design in
  [0008](0008-parser-generalization-and-ai-extraction.md) is judged
  sufficient regardless of which provider is chosen; the provider itself
  isn't picked yet.
- **Live market-data provider** — [0005](0005-multi-currency-and-valuation.md)
  fixes the shape of live vs. document-based valuation; which market-data
  API `backend` actually calls isn't picked yet.

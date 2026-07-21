# 0020: Git-ignored .env for secrets; private repo regardless of data sensitivity

## Status

Accepted — 2026-07-21

## Context

The app needs configuration secrets (DB credentials, session secret, etc.),
and the repository itself contains no real financial data — only code and
schema.

## Decision

- **Secrets**: `.env` file, git-ignored, injected into containers via
  environment variables. Never hardcoded.
- **Repository**: private, regardless of the fact that the code itself
  contains no real financial data.

## Alternatives Considered

- **Public repository** (since no financial data lives in the code) —
  rejected: a private repo costs nothing extra and removes any risk of
  exposing implementation details, security-relevant logic, or future
  accidental secret commits to the public, for an app whose entire purpose is
  handling one household's financial data.
- **Hardcoded config / committed secrets** — rejected as a basic security
  smell; environment-injected secrets are the minimum viable practice for
  credentials that must exist at runtime.

## Consequences

- `.gitignore` must always exclude `.env` (already true — see
  `HilelLustiger/vantage`'s `.gitignore`); an `.env.example` documents
  required variables without real values.
- Encryption at rest and backup/disaster-recovery are separate, still-open
  questions — see the [ADR index](README.md#open-questions) — this ADR only
  covers secrets handling and repo visibility, not broader data-at-rest
  protection.

## Related

- [0001 — System Architecture](0001-system-architecture.md)
- [0004 — Single-household, locally-hosted scope](0004-single-household-locally-hosted-scope.md)
- GitHub milestone **M0 — Scaffolding & Auth**, issue ".env.example, secrets handling, root README, CI workflow"

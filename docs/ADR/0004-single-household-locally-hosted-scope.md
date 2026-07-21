# 0004: Single-household, locally-hosted scope — not a SaaS product

## Status

Accepted — 2026-07-21

## Context

Vantage exists to build a long-term financial source of truth for one
household (currently: two people). It could instead be built as a
multi-tenant product for other households to use.

## Decision

Vantage is a **private, self-hosted platform for a single household**,
deliberately never intended for other households. It is not a SaaS product.

## Alternatives Considered

- **Multi-tenant SaaS** — rejected. Multi-tenancy would demand stronger
  isolation guarantees, a hosting/ops story, billing, and broader security
  hardening — real costs with no payoff, since there is exactly one household
  this needs to work for.

## Consequences

- Every other scope/architecture decision in this project (local hosting,
  no OAuth, manual password reset, no encryption-at-rest yet) is only
  defensible *because* of this narrow scope. If that scope ever changes
  (e.g. sharing this with another household), those decisions need to be
  revisited together, not individually.
- Frees the project from needing per-tenant data isolation, tenant
  onboarding, or billing — Account/User visibility rules only need to handle
  one household's ownership structure (see `docs/DOMAIN.md`).

## Related

- [0001 — System Architecture](0001-system-architecture.md)
- [0018 — No third-party OAuth](0018-no-third-party-oauth.md)
- [0019 — Manual/CLI password reset](0019-manual-password-reset.md)

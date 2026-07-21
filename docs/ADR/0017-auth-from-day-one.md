# 0017: Auth built in from day one, not deferred

## Status

Accepted — 2026-07-21

## Context

Only one user exists initially (soon two: the household). It would be
tempting to skip real auth for a single-user personal project and add it
later once there's an actual second user.

## Decision

Auth is **built in from day one**:

- A real `Users` table — not a hardcoded single-user gate.
- Email + password login, hashed with bcrypt/argon2, server-side sessions
  (cookie-based).

## Alternatives Considered

- **Hardcoded single-user gate, add real auth later** — rejected: retrofitting
  real multi-user auth onto a system built assuming one implicit user is a
  much larger and riskier change than building it correctly from the start,
  especially once Account ownership/visibility rules
  (`docs/DOMAIN.md` — User, Account) depend on there being real, distinct
  Users.

## Consequences

- Account visibility ("a User sees the Accounts they're associated with")
  depends on real per-User identity existing from the first schema — this
  isn't a bolt-on later.
- Session/auth middleware ([0002](0002-single-backend-service-with-api-ingest-modules.md))
  is a foundational M0 piece, not deferred to a later milestone.

## Related

- [0004 — Single-household, locally-hosted scope](0004-single-household-locally-hosted-scope.md)
- [0018 — No third-party OAuth](0018-no-third-party-oauth.md)
- [0019 — Manual/CLI password reset](0019-manual-password-reset.md)
- `docs/DOMAIN.md` — User, Account
- GitHub milestone **M0 — Scaffolding & Auth**

# 0018: No third-party OAuth

## Status

Accepted — 2026-07-21

## Context

Third-party OAuth (e.g. "Sign in with Google") is a well-tested way to avoid
building auth yourself, and its login infrastructure is more battle-tested
than anything hand-built for this project.

## Decision

**No third-party OAuth.** Email + password with server-side sessions
([0017](0017-auth-from-day-one.md)) instead.

## Alternatives Considered

- **Google (or similar) OAuth** — rejected, not for security reasons (Google's
  login infra is genuinely more battle-tested), but because it conflicts with
  the project's own "avoid external services / privacy first" principle —
  login metadata would flow to Google — and it creates an internet dependency
  for logging into what's meant to be a local-only app
  ([0004](0004-single-household-locally-hosted-scope.md)).

## Consequences

- The app must implement its own password hashing and session handling
  correctly (see [0017](0017-auth-from-day-one.md)) rather than delegating
  that responsibility to a third party.
- Logging in works even with no internet connection, consistent with the
  local-hosting model ([0001](0001-system-architecture.md)).

## Related

- [0001 — System Architecture](0001-system-architecture.md)
- [0004 — Single-household, locally-hosted scope](0004-single-household-locally-hosted-scope.md)
- [0017 — Auth built in from day one](0017-auth-from-day-one.md)

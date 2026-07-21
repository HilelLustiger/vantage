# 0019: No email-based password reset — manual/CLI reset instead

## Status

Accepted — 2026-07-21

## Context

Password reset conventionally works by emailing the user a reset link, which
requires an external email-sending service.

## Decision

**No email-based reset flow.** A manual/CLI-based reset instead (e.g. an
admin script or direct DB update), acceptable given only 1-2 users, all of
whom have direct machine/DB access.

## Alternatives Considered

- **Email-based reset flow** — rejected: would require integrating an
  external email-sending service, another external dependency for a
  local-only app ([0001](0001-system-architecture.md)), to solve a problem
  ("I forgot my password") that direct DB/machine access already solves
  trivially at this household's scale.

## Consequences

- Password reset requires someone with direct access to the machine/DB —
  fine for 1-2 co-located users, but this decision would need revisiting if
  remote/multi-household access is ever added (see the open questions in the
  [ADR index](README.md#open-questions)).
- No email infrastructure (SMTP config, templates, deliverability) needs to
  exist anywhere in the system.

## Related

- [0004 — Single-household, locally-hosted scope](0004-single-household-locally-hosted-scope.md)
- [0017 — Auth built in from day one](0017-auth-from-day-one.md)

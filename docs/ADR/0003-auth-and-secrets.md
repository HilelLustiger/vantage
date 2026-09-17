# 0003: Auth & secrets

## Status

Accepted — 2026-09-10 (consolidates the original 0017-auth-from-day-one,
0018-no-third-party-oauth, and 0019-manual-password-reset)

## Context

Only one or two users exist (the household). It's tempting to skip real
auth for a small personal project, lean on third-party OAuth for
battle-tested login infrastructure, or defer password-reset handling — but
each of those trades away something this project actually needs: real
per-User identity from the first schema, and a local-only app that doesn't
depend on an external service just to log in (see 0001, 0002).

## Decision

**Auth is built in from day one** — a real `Users` table, not a hardcoded
single-user gate. Email + password login, hashed with bcrypt/argon2,
server-side sessions (cookie-based).

**No third-party OAuth.** Email + password with server-side sessions
instead — not for security reasons (Google's login infra is genuinely more
battle-tested), but because it would send login metadata to a third party
and create an internet dependency for logging into what's meant to be a
local-only app.

**No email-based password reset.** A manual/CLI-based reset instead (an
admin script or direct DB update) — acceptable given 1-2 users, all with
direct machine/DB access.

## Alternatives Considered

- **Hardcoded single-user gate, add real auth later** — rejected:
  retrofitting multi-user auth onto a system built assuming one implicit
  user is a much larger, riskier change than building it correctly from the
  start, especially once Account ownership/visibility rules depend on real,
  distinct Users existing.
- **Google (or similar) OAuth** — rejected: conflicts with the project's
  privacy-first, local-only stance.
- **Email-based reset flow** — rejected: would require integrating an
  external email-sending service to solve a problem ("I forgot my
  password") that direct DB/machine access already solves trivially at this
  household's scale.

## Consequences

- Account visibility ("a User sees the Accounts they're associated with")
  depends on real per-User identity existing from the first schema — not a
  bolt-on later.
- The app implements its own password hashing and session handling
  correctly rather than delegating to a third party; login works with no
  internet connection.
- No email infrastructure (SMTP config, templates, deliverability) needs to
  exist anywhere in the system.
- Password reset requires someone with direct access to the machine/DB —
  fine at this scope, but would need revisiting if remote/multi-household
  access is ever added (see the ADR index's open questions).

## Related

- 0001 — System architecture & service topology
- 0002 — Product scope & governance
- `docs/DOMAIN.md` — User, Account

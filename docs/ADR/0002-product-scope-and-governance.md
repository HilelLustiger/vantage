# 0002: Product scope & governance

## Status

Accepted — 2026-09-10 (consolidates the original
0004-single-household-locally-hosted-scope, 0006-investments-and-transactions-are-separate-features,
0020-secrets-and-repo-visibility, 0028-no-transactions-feature, and
0030-public-repository-code-and-docs-only)

## Context

Vantage exists to build a long-term financial source of truth for one
household. It could instead be built as a multi-tenant product, could grow a
second "Transactions" feature, and its repository's visibility was an early,
low-stakes-seeming choice that turned out to be worth revisiting once the
actual motivation behind it was examined.

On Transactions specifically: the real-world problem Vantage solves —
an investor's holdings scattered across a broker's app, a provident fund's
portal, a bank's view of a money-market fund, with no single place summing
them to one total — never actually included day-to-day bank/transaction
activity. That was an early, unvalidated assumption, not a requirement.

On repo visibility: the original reasoning for staying private wasn't about
protecting data (the repo never held any), it was inertia. Revisited once
the actual goal was named — showcasing the project (the code, and the ADR
trail itself) — which a public repo serves directly and a private one
doesn't.

## Decision

**Single-household, locally-hosted, not a SaaS product.** Deliberately never
intended for other households — no per-tenant isolation, no billing, no
tenant onboarding. Every other scope decision in this document (and 0001, 0003) is only defensible _because_ of this narrow scope; if that scope ever
changes, they need revisiting together, not individually.

**Investments is the only feature — Transactions is out of scope entirely,
not deferred.** `docs/DOMAIN.md` carries no mention of a future Transactions
feature. `User`, `Account`, `Institution` are shaped by Investments' own
needs only, with no obligation to stay generic for a feature that isn't
coming. (A related idea — unifying credit-card charges across cards into one
household view — was also considered and rejected as in-scope: different
problem, more likely its own separate tool.)

**Secrets**: a git-ignored `.env` file, injected into containers via
environment variables, never hardcoded — unaffected by anything below.

**Repository visibility: public — code and documentation only, no demo
deployment.** The ADR trail itself is part of what's shown. No public demo
deployment: real extra work (synthetic seed data, separate hosting and
maintenance) for a goal ("people can see it") that code plus documentation
already serves. The real, personal instance (real financial data) stays
exactly as the local-hosting decision above describes — entirely separate
from what's public, never deployed from or connected to anything
public-facing.

**Storing the raw uploaded document on local disk (plaintext) is not a
sensitivity compromise, and doesn't need reopening.** Raised while planning
the 0001/0008 refactor: should `backend` avoid persisting the raw file,
given it contains sensitive financial data, and keep only a checksum for
dedup instead? Decided no, on two separate grounds: the public-repo decision
above is irrelevant here, since no real document, hash, or DB row from the
personal instance ever enters the repository — the two are fully decoupled
by construction; and since the DB and file storage are both local (single
personal instance, nothing cloud-hosted — see 0001), there's no second trust
domain being crossed by storing the raw file — it sits at the same trust
level the DB already does. This does not reopen the encryption-at-rest open
question (see the ADR index).

## Alternatives Considered

- **Multi-tenant SaaS** — rejected: stronger isolation guarantees, a
  hosting/ops story, billing, and broader security hardening are real costs
  with no payoff for exactly one household.
- **Keep Transactions "deferred"** rather than dropped — rejected: it was
  never a validated requirement; "deferred" would keep core entities under
  an obligation to stay general-purpose for a feature that isn't coming.
- **One unified data model covering Investments and a hypothetical
  Transactions** — rejected even before Transactions was dropped entirely:
  snapshot-based positions and transaction/line-item data are genuinely
  different shapes; forcing them into one abstraction before the second one
  is even designed risks a speculative abstraction that fits neither.
- **Stay private** — rejected once the actual goal (showcasing) was
  identified; a private repo no longer serves it, and the repo never had
  real data to protect in the first place.
- **Public repo + public demo deployment with synthetic data** — rejected:
  real ongoing cost (seed data, hosting, maintenance) for a marginal benefit
  over "read the code and the docs."
- **Hardcoded config / committed secrets** — rejected as a basic security
  smell regardless of repo visibility.

## Consequences

- Account/User visibility rules only need to handle one household's
  ownership structure (see `docs/DOMAIN.md`).
- `CashFlowSource` in `backend/src/dto` no longer needs its comment
  distinguishing itself from a since-dropped Transactions concept.
- Care is needed before/while the repo is public: audit history and any
  sample files under `parser/tests` for anything that isn't actually
  synthetic; never commit a secret regardless of visibility. `sandbox/` is
  entirely git-ignored (throwaway experiments, never part of the repo), so
  it isn't part of this audit.
- If this household's scope ever changes (sharing with another household,
  hosting elsewhere), this ADR is the one to reopen — not local hosting,
  auth, or secrets handling individually.

## Related

- 0001 — System architecture & service topology
- 0003 — Auth & secrets
- `docs/DOMAIN.md`

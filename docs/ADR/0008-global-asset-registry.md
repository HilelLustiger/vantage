# 0008: Global Asset registry, shared across Accounts

## Status

Accepted — 2026-07-21

## Context

The same tradable Asset (e.g. Apple stock) can be held across multiple
Accounts, possibly at different Institutions. The dashboard's core value
proposition is showing total exposure to an Asset across every Account a
User can see.

## Decision

`Asset` is a **global/shared registry**, not per-account or per-Institution.
Assets are matched across imports by **ticker symbol or ISIN** when
available. Each Asset has a **type** field (Stock, ETF, Mutual Fund, Bond,
Cash, ...), captured at import time since it's expensive to retrofit later
(e.g. for "allocation by type" charts). A fund is stored as a single Asset,
with no decomposition into underlying holdings.

Note: named "Asset," not "Security," specifically to avoid colliding with the
app's own security architecture ([0017](0017-auth-from-day-one.md)).

## Alternatives Considered

- **Per-Account or per-Institution Asset records** — rejected: this is
  exactly what would prevent cross-account aggregation, the dashboard's core
  value. It would require an extra de-duplication/merge layer to reconstruct
  what the global registry gives for free.
- **Decomposing funds into underlying holdings** — rejected as unnecessary
  complexity for v1; a fund is just an Asset like a stock, until there's a
  concrete need to look inside one.

## Consequences

- Import must resolve each parsed line to an existing Asset or a genuinely
  new one — see
  [0010 — Asset resolution requires manual confirmation](0010-asset-resolution-requires-manual-confirmation.md).
- Accidentally-duplicated Assets are possible (e.g. same company matched
  under two different tickers); a merge/cleanup tool for this is explicitly
  deferred to a future feature.
- The "type" field must be captured at import time, not backfilled — getting
  this wrong at import time means a manual data-fix later.

## Related

- `docs/DOMAIN.md` — Asset, Holding
- [0010 — Asset resolution requires manual confirmation](0010-asset-resolution-requires-manual-confirmation.md)
- [0012 — Multi-currency: store original, convert at read time](0012-multi-currency-store-original-convert-at-read.md)

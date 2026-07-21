# 0012: Multi-currency — store original currency, convert at read time

## Status

Accepted — 2026-07-21

## Context

Multi-currency support is confirmed necessary: the household's accounts exist
in both USD and ILS. A Holding's value could be converted to a single
currency at import time, or kept in its original currency and converted only
when displayed.

## Decision

**Store every Holding's value in its original currency** as parsed — never
convert on import, since that would be lossy/irreversible. **Convert to a
unified display currency at read time** (dashboard render), using historical
exchange rates.

**Exchange rate source:** [Frankfurter](https://frankfurter.dev) — free, no
API key, covers USD/ILS, supports historical dates back to 1999. This is a
**deliberate, narrow exception** to "avoid external services": it sends no
personal or financial data, only a date and currency pair (effectively public
information). Every rate fetched is cached locally so each historical date is
looked up only once.

## Alternatives Considered

- **Convert to a single currency at import time** — rejected: lossy and
  irreversible. If the display currency ever needs to change, or a historical
  rate turns out wrong, there's no way to recover the original value.
- **Paid/authenticated exchange rate API** — rejected in favor of
  Frankfurter specifically because it requires no API key and no account,
  minimizing the exception being made to the project's external-services
  aversion.

## Consequences

- Portfolio aggregation ([0008](0008-global-asset-registry.md)) must fetch or
  read a cached rate for every historical date it displays, not just "today."
- A local rate cache is required infrastructure, not optional — repeated
  dashboard renders shouldn't repeatedly hit Frankfurter for the same date.
- If Frankfurter ever becomes unavailable or insufficient (e.g. a currency
  pair it doesn't cover), this is the ADR to revisit — the storage decision
  (original currency, never converted on write) doesn't need to change even
  if the rate *source* does.

## Related

- [0008 — Global Asset registry](0008-global-asset-registry.md)
- GitHub milestone **M2 — API module**, issue "Portfolio aggregation endpoint"

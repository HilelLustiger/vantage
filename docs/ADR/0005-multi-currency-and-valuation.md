# 0005: Multi-currency and valuation — original currency, native display, live vs. document-based

## Status

Accepted — 2026-09-10 (consolidates the original
0012-multi-currency-store-original-convert-at-read,
0022-multi-currency-display-native-vs-aggregate, and
0031-valuation-duality-live-vs-document-based)

## Context

The household's accounts exist in more than one currency (USD and ILS), and
a Holding's value could be converted to a single currency at import time, at
display time, or never at all depending on the surface. Separately,
Vantage's purpose — one place showing every investment product together,
summed to one total — exposed a gap once live pricing became possible for
exchange-traded assets: without a notion of _how_ a Holding is valued, a
portfolio total silently implies one uniform freshness that isn't true once
some Holdings can be priced live and others only as of the last statement.

## Decision

**Storage: original currency, never converted on write.** Every Holding's
value is stored exactly as parsed. Converting on import would be lossy and
irreversible — if the display currency ever needs to change, or a
historical rate turns out wrong, there'd be no way to recover the original
value.

**Exchange rate source**: [Frankfurter](https://frankfurter.dev) — free, no
API key, covers USD/ILS, historical dates back to 1999. A deliberate,
narrow exception to avoiding external services: it receives no personal or
financial data, only a date and currency pair. Every rate fetched is cached
locally so each historical date is looked up once.

**Display: two tiers, not one uniform selector.** Entity-level UI (a
specific Holding/Asset's value — e.g. the Assets page's per-Asset view)
shows value in its original currency, never converted, one figure per
currency actually held, no currency selector on that surface at all.
Quantity is currency-agnostic and always sums normally. Aggregate/summary UI
(Dashboard total, allocation, history) is mathematically meaningless without
a single reference currency, so it keeps a currency selector — scoped only
to those aggregate surfaces, and always shown alongside a currency-breakdown
view (native-currency composition) so a converted total is never presented
without visibility into what currencies actually make it up.

**Valuation kind: every Holding is live-priced or document-only.**
Live-priced (stocks, ETFs) are valued using a live market price, sourced
from a market-data API called directly by `backend` (0001) — no dedicated
pricing service unless this later gets complex enough to justify one.
Document-only (provident funds, money-market funds, deposits) are valued
exactly as before, from the last imported statement. Quantity always comes
from Documents regardless of valuation kind — only the _price_ used to
value a known quantity can come from a live source.

**Freshness is per-Holding, not per-Account.** A portfolio total is
honestly a mix of "live, seconds old" and "stale, as of the last statement"
figures, and the UI surfaces that mix explicitly (the total splits
live-priced vs. statement-based by percentage and freshness caption; the
Assets list carries a per-holding freshness badge graded by days since the
last statement) rather than implying one uniform "as of" date.

**`PortfolioHistory` stays event-based, not continuous**, even though the
current headline total can now update live. A continuous, daily-resolution
line for the market-priced portion mixed with a stepped line for the
document-only portion, in one combined total, was judged visually confusing
for a graph whose job is showing trend, not daily resolution. It keeps one
point per portfolio event (any new Document ingested for any Account) — a
point that includes a live-priced Asset uses the market price at that same
moment, never a reconstructed historical daily price. Only the _current_
total updates continuously; the history graph never gains continuous
granularity.

## Alternatives Considered

- **Convert to a single currency at import time** — rejected: lossy and
  irreversible.
- **Paid/authenticated exchange-rate API** — rejected in favor of
  Frankfurter specifically because it needs no API key or account,
  minimizing the exception to the external-services aversion.
- **Keep one unified currency selector everywhere** — rejected: hides a
  household's actual multi-currency composition behind a single number.
- **Remove conversion entirely, always show every figure natively** —
  rejected: a Total net worth spanning two currencies has no natural single
  number without a reference currency.
- **Per-entity currency selector** (e.g. on the Assets page too) —
  rejected: implies "there's one true converted number," exactly what
  entity-level UI should avoid implying.
- **One uniform "as of" date for the whole portfolio total** — rejected:
  actively dishonest once any Holding can be priced live while others are
  weeks or months stale.
- **A continuous net-worth-over-time graph** — rejected: a smooth line for
  part of the total and a stepped line for the rest, combined, was judged to
  actively mislead about what the graph shows.
- **A dedicated pricing/market-data service from the start** — rejected for
  now: no complexity yet that justifies it over `backend` calling a
  market-data API directly.

## Consequences

- Portfolio aggregation must fetch or read a cached rate for every
  historical date it displays, not just "today"; a local rate cache is
  required infrastructure.
- `GET /api/portfolio/by-asset` groups the latest active Snapshots' Holdings
  by `(assetId, currency)`, raw/unconverted, with no FX lookups and no
  `currency` param; `GET /api/portfolio` (aggregate) is a separate, already
  currency-converting endpoint. The Assets page shows Quantity plus one
  Value chip per currency actually held, with no `%`-of-portfolio column
  (an aggregate-derived stat that doesn't belong on a no-conversion
  surface).
- `Holding`/`Asset` need a valuation-kind field and a live/stale distinction
  that the read path (aggregation, per-Asset breakdown) accounts for. The
  market-data provider choice is still open (see the ADR index).
- Worth double-checking at implementation (not reopening now): a
  foreign-listed live-priced stock's currency should already be covered by
  "store original, convert at read" without further change.

## Related

- 0001 — System architecture & service topology
- 0004 — Domain model core
- 0006 — Cash-flow tracking & return metrics

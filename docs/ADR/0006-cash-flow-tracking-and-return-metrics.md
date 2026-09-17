# 0006: Cash-flow tracking & return metrics — per-Asset and portfolio-level

## Status

Accepted — 2026-09-10 (consolidates the original
0023-per-asset-cash-flow-tracking-and-return-metrics,
0024-ingesting-per-transaction-statement-formats, and
0032-portfolio-level-real-profit)

## Context

Vantage had no cost-basis or transaction data model — `Holding` only
captured point-in-time value. A rising portfolio total conflates two
different things: the market going up, and money being added (a new
deposit, a newly purchased Asset) — a household can't tell "real" gain from
new contributions without one. Real statements already carry much of what's
needed: Excellence's `purchaseCostIls` (real cost basis, no date), Gemel's
period-dated `deposits`/`withdrawals`/`transfers`, and real per-transaction
dated data from Hapoalim and Excellence's optional transactions table — none
of it persisted past commit.

No purchase-price/transaction feature exists elsewhere to lean on: the
dropped "Transactions" idea (0002) is a distinct, bank-activity concept,
confirmed explicitly not what this covers.

## Decision

**A new `cash_flows` table** — one append-only row per dated cash-flow
event, scoped **per-Asset** (matches how cost basis is already reported
per-security, and gives each holding in a multi-asset Account its own
meaningful metrics). Shape: account, asset, date, amount (positive =
contributed/bought, negative = withdrawn/sold; sign-flipped to finance
convention only at XIRR computation time), currency, a source/provenance tag
(derived-from-period-aggregate vs. real-ingested-transaction vs.
derived-from-cost-basis-delta), and a link back to the Document that
produced it. Immutable once written, mirroring Snapshot's own
immutability/supersede precedent (0004) — corrections append new rows,
nothing is rewritten.

**What counts as a flow**: only external deposits/withdrawals/transfers.
Confirmed via Gemel's own reconciliation identity (`starting + deposits +
transfers + gain_loss + fees + withdrawals + transfers_out = ending`) that
`gain_loss` and `fees` are already netted into the balance progression —
performance, not cash flow, and never recorded as `cash_flows` rows.

**Dating**: every derived flow (from a period aggregate, e.g. Gemel) is
dated at that statement's own `asOfDate` — a deliberate, conservative bias
that slightly understates elapsed time for money that arrived earlier in
the period, so computed rates run a little low, never falsely high. Real
per-transaction imports carry an exact date already, needing no
approximation.

**Cost basis precedence**: prefer an institution's own directly-stated
figure (Excellence's `purchaseCostIls`) when available; fall back to the
running sum of `cash_flows` only when the institution doesn't provide one
directly — the institution's number is immune to "our ingested history
doesn't go back far enough," while a derived sum only improves as more
history is imported.

**Dedup**: a composite natural key (date + asset + kind + amount + the
statement's own running balance-after figure, where available) — no
institution gives a true unique transaction ID, so re-importing an
overlapping transaction-log export must skip rows already recorded rather
than double-count them.

**Metrics** (computed from `cash_flows` + the Asset's current value, all in
that Asset's own native currency):

- `costBasis` — per the precedence rule above.
- `profit = currentValue − costBasis`.
- `simpleReturnPct = profit ÷ costBasis × 100` — always shown, stays
  meaningful even for a brand-new position.
- `xirr` — money-weighted, annualized return, solved numerically from the
  dated flow series plus a final "as of today" valuation point.
  De-emphasized/hidden below a minimum holding-period threshold — a very
  short window annualized is technically correct but misleading.
- `taxOnProfit = max(profit, 0) × TAX_RATE` — a single global env-var
  constant, not DB-backed or per-account, deliberately simple. Only applied
  to an actual profit, never a negative "tax" on a loss.
- `netOfTax = currentValue − taxOnProfit`.

**Ingesting the flow data itself**: two real new document shapes route
through the existing Investments ingestion path (0007), not a new feature —
this is still investment-holdings data. Bank Hapoalim's account-transactions
export (no balance/holdings section at all, just dated per-security rows)
gets a new extractor module and a new content-detection signature (0007).
Excellence's existing balance-report format sometimes includes a second
"פירוט תנועות" table — extended to parse it when present, alongside the
existing holdings table. `securityNumber` becomes a real Asset-matching key
alongside ticker/ISIN (0004) — both to auto-match a large first
transaction-log import (which would otherwise mean a very large manual
review batch) and, as a side effect, to fix auto-match for holdings that
never carried a ticker/ISIN at all. A Document whose parsed data has
transactions but no holdings/balance section commits directly to
`cash_flows` with **zero Snapshots created** — a real, new terminal outcome,
not an invented carried-forward Snapshot (which would misrepresent 0004's
guarantee that a Snapshot is a real reported balance). A Document with both
sections commits to Snapshot+Holdings and `cash_flows` together.

**Portfolio-level cost basis and profit**, aggregating the per-Asset metrics
above: `portfolioCostBasis` = sum of each held Asset's `costBasis`;
`portfolioProfit` = total portfolio value − `portfolioCostBasis`. Surfaced
on the Dashboard as a "Real profit" figure next to the total, with copy
making explicit that new contributions don't count as profit. The
net-worth-over-time graph gains cost basis as a **second line, stepped
exactly like the value line** — it only moves at a cash-flow-producing
statement event, never continuously, following directly from the dating
rule above. The shaded area between the two lines visualizes real profit:
it grows only when the market does, and stays flat across a
pure-contribution event.

**A closed position (quantity zero after having been held) is a distinct
state from "never held,"** not the same blank row — it sorts to the bottom
of the Assets list, renders visually dimmed with a "Closed" badge, and its
expanded detail shows the realized outcome (held period, cost basis,
proceeds, realized profit, return %) computed from its still-append-only
`cash_flows` history, rather than disappearing into "—".

## Alternatives Considered

- **Nullable columns directly on `Holding`** instead of a new table —
  rejected: pushes "how do many Holdings over time become a dated flow
  series" to read-time, recomputed every request, instead of once at
  commit.
- **Always prefer our own derived cost basis**, ignoring institution-stated
  figures — rejected: silently wrong whenever ingested history doesn't
  cover a position's full lifetime.
- **Per-account or per-asset-type tax rate** — rejected in favor of a single
  global rate; explicit simplification.
- **XIRR alone, drop simple return %** — rejected: complementary, not
  redundant; XIRR alone is actively misleading for very recently opened
  positions.
- **A wholly separate `DocumentFeature`** for transaction-shaped data —
  rejected: would duplicate the entire upload/lifecycle/asset-resolution
  pipeline for data that's still, conceptually, investment holdings.
- **Require every transactions-only import to also produce a Snapshot**
  (carrying the last known balance forward) — rejected: would misrepresent
  Snapshot's own immutability guarantee.
- **Leave portfolio growth unexplained** — rejected: the whole motivation
  for per-Asset cash-flow tracking is incomplete if it stops there and the
  one number a household looks at first (the portfolio total) doesn't get
  it.
- **A continuous/smoothed cost-basis line** — rejected for the same reason
  the value line stays stepped: cost basis can only change when a document
  says it did.
- **Let a closed position simply disappear from the Assets list** —
  rejected: discards a real, already-computed outcome for no benefit.

## Consequences

- New `cash_flows` table + migration; existing Gemel/Excellence commit
  paths must additionally derive and insert `cash_flows` rows.
- `ingest`'s orchestration (0001, once relocated to `parser`) needs real
  branching: holdings-only, transactions-only (no Snapshot), and
  both-in-one-Document (dual write).
- XIRR needs a real numerical root-finder (e.g. Newton's method) — new,
  non-trivial code worth its own test suite (known-answer cases, not just
  "doesn't crash").
- The Portfolio aggregation read path needs to sum per-Asset cost basis
  across all held Assets. The history graph's data shape grows from one
  series (value) to two (value, cost basis) per point.
- The Assets list/detail view needs a "closed" status distinct from
  "unheld," computed from whether an Asset was ever held (any `cash_flows`
  rows) versus currently holding zero quantity.

## Related

- 0004 — Domain model core
- 0005 — Multi-currency and valuation
- 0007 — Ingestion pipeline architecture

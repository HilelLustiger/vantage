# 0023: Per-Asset cash-flow tracking and return metrics

## Status

Proposed — 2026-07-23

## Context

`#33` asked for a return % and total amount per Asset. Vantage has no
cost-basis or transaction data model — `Holding` (ADR-0008/0009) only
captures point-in-time value. Investigating what's actually available
showed real statements already carry much of what's needed —
Excellence's `purchaseCostIls` (real cost basis, no date), Gemel's
period-dated `deposits`/`withdrawals`/`transfers`, and (per ADR-0024)
real per-transaction dated data from Hapoalim and Excellence's optional
transactions table — none of which is persisted past commit today.

No purchase-price/transaction feature exists elsewhere to lean on either
— ADR-0006's "Transactions" is a distinct, not-yet-designed bank-activity
feature, explicitly not what this covers (confirmed with the household:
"transactions in the assets," not that feature).

## Decision

**A new `holding_flows` table** — one append-only row per dated cash-flow
event, scoped **per-Asset** (not per-Account, not portfolio-wide — matches
how cost basis is already reported per-security, and gives each holding
in a multi-asset Account its own meaningful metrics). Shape: account,
asset, date, amount (positive = contributed/bought, negative = withdrawn/
sold — stored in intuitive terms; sign-flipped to finance convention only
at XIRR computation time), currency, a source/provenance tag
(derived-from-period-aggregate vs real-ingested-transaction vs
derived-from-cost-basis-delta), and a link back to the Document that
produced it. Immutable once written, mirroring Snapshot's own
immutability/supersede precedent (ADR-0009) — corrections append new
rows, nothing is ever rewritten.

**What counts as a flow**: only external deposits/withdrawals/transfers.
Confirmed via Gemel's own reconciliation identity (`starting + deposits +
transfers + gain_loss + fees + withdrawals + transfers_out = ending`)
that `gain_loss` and `fees` are already netted into the balance
progression — they are performance, not cash flow, and must never be
recorded as `holding_flows` rows.

**Dating**: every derived flow (from a period aggregate, e.g. Gemel) is
dated at that statement's own `asOfDate` — the one date every institution
reliably gives us. Documented, deliberate, conservative bias: this
slightly understates elapsed time for money that arrived earlier in the
period, so computed rates run a little low, never falsely high. Real
per-transaction imports (ADR-0024) need no such approximation — they
carry an exact date already.

**Cost basis precedence**: prefer an institution's own directly-stated
figure (Excellence's `purchaseCostIls`) when available; fall back to the
running sum of `holding_flows` only when the institution doesn't provide
one directly. The institution's number is authoritative and immune to
"our ingested history doesn't go back far enough" — our derived sum is an
approximation that only improves as more historical periods get
imported.

**Dedup**: a composite natural key (date + asset + kind + amount + the
statement's own running balance-after figure, where available) — no
institution gives us a true unique transaction ID (Hapoalim's "אסמכתא"
is a security reference, not a transaction ID, confirmed against a real
sample), so re-importing an overlapping transaction-log export (expected
— Hapoalim's own export is a rolling 2-year window) must skip rows
already recorded rather than double-count them.

**Metrics** (computed from `holding_flows` + the Asset's current value,
all in that Asset's own native currency — no FX conversion needed, since
cost basis and value are already denominated the same way, consistent
with ADR-0022's native-currency-per-entity principle):

- `costBasis` — per the precedence rule above.
- `profit = currentValue − costBasis`.
- `simpleReturnPct = profit ÷ costBasis × 100` — always shown, stays
  meaningful even for a brand-new position (unlike XIRR, see below).
- `xirr` — money-weighted, annualized return, solved numerically from the
  dated flow series plus a final "as of today" valuation point. Requires
  a real numerical solver (no closed form). De-emphasized/hidden below a
  minimum holding-period threshold (exact value TBD at implementation) —
  annualizing a very short window produces a technically-correct but
  misleading extrapolated rate.
- `taxOnProfit = max(profit, 0) × TAX_RATE` — a new required env var
  (single global constant, not DB-backed, not per-account — deliberately
  simple; the household will tune it directly, same pattern as
  `SESSION_SECRET`). Only applied to an actual profit, never produces a
  negative "tax" on a loss.
- `netOfTax = currentValue − taxOnProfit` — "what you'd keep."

Both `simpleReturnPct` and `xirr` are kept, deliberately — they answer
different questions (total magnitude vs. annualized rate) and XIRR alone
is actively misleading for very recently opened positions.

## Alternatives Considered

- **Nullable columns directly on `Holding`** instead of a new table —
  rejected: pushes "how do many Holdings over time become a dated flow
  series" logic to read-time, recomputed every request, instead of once
  at commit.
- **Always prefer our own derived cost basis**, ignoring institution-
  stated figures — rejected: silently wrong whenever ingested history
  doesn't cover a position's full lifetime (a near-certainty for
  Hapoalim, whose transaction export only covers 2 years back).
- **Per-account or per-asset-type tax rate** — rejected in favor of a
  single global rate; explicit simplification, not an oversight.
- **XIRR alone, drop simple return %** — rejected: XIRR's annualization
  is misleading for young positions in a way simple return % isn't; they
  are complementary, not redundant.

## Consequences

- New `holding_flows` table + migration; new shared-types.
- Existing Gemel/Excellence commit paths must additionally derive and
  insert `holding_flows` rows, not just Snapshot+Holdings.
- XIRR needs a real numerical root-finder (e.g. Newton's method) — new,
  non-trivial computational code, worth its own careful test suite
  (known-answer cases, not just "doesn't crash").
- Tied to ADR-0024 for how flow data actually gets ingested.

## Related

- [0008 — Global Asset registry](0008-global-asset-registry.md)
- [0009 — Snapshot immutability and supersede](0009-snapshot-immutability-and-supersede.md)
- [0012 — Multi-currency, store original, convert at read](0012-multi-currency-store-original-convert-at-read.md)
- [0016 — No special backfill mode](0016-no-special-backfill-mode.md)
- [0022 — Multi-currency display](0022-multi-currency-display-native-vs-aggregate.md)
- [0024 — Ingesting per-transaction statement formats](0024-ingesting-per-transaction-statement-formats.md)
- GitHub issue `#33`

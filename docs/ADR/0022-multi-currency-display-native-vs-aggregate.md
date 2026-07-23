# 0022: Multi-currency display — native currency per entity, converted only for aggregates

## Status

Accepted — 2026-07-23

## Context

`#11` shipped the Dashboard with a single currency selector that
force-converts every figure (total, allocation, per-asset table) into
one chosen display currency, per ADR-0012's "convert at read time."
`#30` reports this as wrong: a household can hold Assets in more than
one currency (USD and ILS accounts both exist), and collapsing
everything into one switchable currency hides that — the point isn't
"let me switch which one currency I see," it's "let me see what's
actually in each currency." Per `#30`: "we need to support multiple
coins in the UI of each holding, asset, account and in the dashboard
that summarizes it."

This sits alongside net-worth-over-time and currency-breakdown work
already being designed for the Dashboard this round — currency-breakdown
was already heading in this direction (a native-currency-grouped view),
which is what surfaced the tension in the first place: some of the
Dashboard is *inherently* aggregate (a single Total net worth number is
only meaningful with a reference currency — a core value prop per
`docs/DOMAIN.md`'s Portfolio definition), while entity-level views (a
specific Asset's holdings) have no such requirement and shouldn't be
silently converted.

## Decision

**Two display tiers, not one uniform currency selector:**

1. **Entity-level UI** (a specific Holding/Asset's value, e.g. the
   Assets page's per-Asset table) shows value **in its original
   currency, never converted** — one figure per currency actually held,
   with no currency selector on that surface at all. `Quantity` is
   currency-agnostic (share count, not money) and always sums normally
   across Accounts regardless of which currency each is priced in.
2. **Aggregate/summary UI** (Dashboard's Total net worth, Allocation by
   type, Net worth over time) is mathematically meaningless without a
   single reference currency to sum into — these keep a currency
   selector, scoped *only* to these three cards. They are always shown
   alongside the **Currency breakdown** card (native-currency
   composition, `%` computed via conversion but the headline number per
   currency stays raw/unconverted) so a converted total is never
   presented without visibility into what currencies actually make it
   up — directly answering `#30`'s "the dashboard that summarizes it."

ADR-0012's underlying storage/conversion decision (store original,
convert at read time, Frankfurter, local rate cache) is unchanged — this
ADR is purely about which *UI surfaces* apply that conversion, not
whether the capability exists.

## Alternatives Considered

- **Keep one unified selector everywhere** (status quo, `#11`) —
  rejected per `#30`: hides a household's actual multi-currency
  composition behind a single number, which is the specific complaint.
- **Remove conversion entirely, always show every figure natively** —
  rejected: Total net worth and Net worth over time are only meaningful
  as single numbers with a reference currency; a portfolio spanning two
  currencies has no natural "total" without one. Would also remove a
  real, already-requested feature (`#11`'s own issue text: "unified
  display currency").
- **Per-entity currency selector** (e.g. a selector on the Assets page
  too) — rejected: contradicts the point of showing native currency
  there; a selector implies "there's one true converted number," which
  is exactly what entity-level UI should avoid implying.

## Consequences

- New endpoint `GET /api/portfolio/by-asset` (no `currency` param, no
  FX lookups, no 502 failure mode) — groups the latest active Snapshots'
  Holdings by `(assetId, currency)`, summing `quantity` per Asset across
  all currencies and `value` per `(Asset, currency)` pair, raw/unconverted.
- `packages/shared-types` gains `AssetCurrencyValue { currency: string;
  value: string }` and `AssetHoldingBreakdown { assetId: string;
  quantity: string; valuesByCurrency: AssetCurrencyValue[] }` /
  `PortfolioByAsset { userId: string; assets: AssetHoldingBreakdown[] }`
  — a distinct shape from `PortfolioLine`, not a variant of it.
- `AssetsPage` drops its (not-yet-shipped) currency selector and the
  `%`-of-portfolio column entirely — `%` is an aggregate-derived stat
  and doesn't belong on a native-currency, no-conversion surface. It
  shows Quantity + one Value chip per currency actually held.
- `GET /api/portfolio` (existing, powers Total net worth + Allocation by
  type) is unchanged — it's correctly an aggregate endpoint.
- Dashboard's Currency breakdown card becomes not just "nice to have"
  but the load-bearing answer to `#30` — it must ship together with the
  currency selector, never as a separate/later card.
- Closes `#30` once implemented.

## Related

- [0012 — Multi-currency, store original, convert at read](0012-multi-currency-store-original-convert-at-read.md)
- [0008 — Global Asset registry](0008-global-asset-registry.md)
- GitHub issue `#30`

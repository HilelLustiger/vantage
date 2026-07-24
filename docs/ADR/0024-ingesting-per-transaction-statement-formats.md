# 0024: Ingesting per-transaction statement formats

## Status

Proposed — 2026-07-23

## Context

ADR-0023 needs real dated cash-flow data. Two real new document shapes
were confirmed against real samples in `sandbox/samples/`:

- **Hapoalim account transactions** (`תנועות בחשבון מסחר פועלים.pdf`) — a
  genuinely new document shape: no balance/holdings section at all, just
  dated per-security rows (date, security number, security name,
  transaction type — buy/sell/dividend/deposit, quantity, price, fee,
  amount, and on some rows a tax-withheld figure). Different bank portal
  page (`.../current-account/transactions`) from the existing balance
  report Vantage already parses.
- **Excellence's optional transactions table** — confirmed by comparing
  two real samples: the *same* balance-report PDF format `excellence.py`
  already parses sometimes includes a second "פירוט תנועות" section (when
  there was activity that period) with equivalent per-transaction detail,
  including its own tax column. Not a new format — an optional second
  table within the existing one.

## Decision

Both route through the **existing `investments` `DocumentFeature`**
(ADR-0013's shared ingestion front door) — not a new top-level feature.
This is still fundamentally investment-holdings data; ADR-0006's reserved
`"transactions"` `DocumentFeature` value refers to a distinct, separate,
not-yet-designed bank-activity feature and is not reused here.

- **Excellence**: extend `apps/parser/excellence.py` to also parse the
  optional "פירוט תנועות" table when present, emitting a `transactions`
  array alongside the existing `holdings` array.
- **Hapoalim**: a new extractor module, plus a new ADR-0021
  content-detection signature (same institution, a second recognized
  document shape — same precedent as Excellence's own balance-vs-detail
  distinction).
- **`securityNumber` becomes a real Asset-matching key**, alongside
  `ticker`/`isin` — `Asset` gains an optional `securityNumber` field;
  `assetResolution.ts`'s `matchHolding` tries it too. This fixes
  auto-match for Excellence's *existing* balance-report holdings as a
  side effect (today, per `assetResolution.ts`'s own comment, every real
  holding lands in `needs_review` since no parser emits ticker/isin) —
  and is necessary for the new transaction rows, since a transaction-log
  import can carry many rows at once and would otherwise mean a very
  large manual-review batch on first import.
- **New "flows-only" commit path**: a Document whose parsed data has
  transactions but no holdings/balance section (Hapoalim) commits
  directly to `cash_flows` rows with **zero Snapshots created** — a
  new, real terminal outcome. Inventing a synthetic carried-forward
  Snapshot to preserve "every committed Document has exactly one
  Snapshot" was considered and rejected (see below). A Document with
  *both* sections (Excellence, when activity occurred) commits to
  Snapshot+Holdings **and** `cash_flows` in the same transaction.
- Dedup (ADR-0023's composite natural key) happens at this commit step.

## Alternatives Considered

- **A wholly separate `DocumentFeature`** for this data — rejected: would
  duplicate the entire upload/lifecycle/asset-resolution pipeline
  (ADR-0011/0013) for data that is still, conceptually, investment
  holdings.
- **Require every transactions-only import to also produce a Snapshot**
  (e.g. carrying the last known balance forward unchanged) — rejected:
  would misrepresent ADR-0009's guarantee that a Snapshot is a real
  reported balance, not an invented one.
- **Treat Hapoalim's 2-year rolling transaction export as needing a
  special bulk-import mode** — rejected: confirmed no conflict with
  ADR-0016; each flow row is independently dated and immutable, same as
  Snapshots, so "upload the file, same pipeline" still holds.

## Consequences

- `apps/backend/src/ingest/index.ts` / `snapshotCreation.ts` need real
  branching: holdings-only (today's only path), transactions-only (new,
  no Snapshot), and both-in-one-Document (new, dual write).
- `resolveAssets`/the `needs_review` review flow may see much larger
  batches on a first historical-transaction import — the existing UI
  (`ReviewDocumentPage.tsx`, `#10`) already supports arbitrary batch size,
  so no UI redesign is required there, just a heads-up that it'll be
  exercised at a new scale.
- ADR-0021's per-institution registry gains a second recognized shape for
  Bank Hapoalim.

## Related

- [0006 — Investments and Transactions are separate features](0006-investments-and-transactions-are-separate-features.md)
- [0009 — Snapshot immutability and supersede](0009-snapshot-immutability-and-supersede.md)
- [0010 — Asset resolution requires manual confirmation](0010-asset-resolution-requires-manual-confirmation.md)
- [0011 — Document lifecycle](0011-document-lifecycle-separate-state-machine.md)
- [0013 — Shared ingestion front door](0013-shared-ingestion-front-door.md)
- [0014 — Parser registry, generic dispatch](0014-parser-registry-generic-dispatch.md)
- [0016 — No special backfill mode](0016-no-special-backfill-mode.md)
- [0021 — Automatic institution/account detection](0021-automatic-institution-account-detection.md)
- [0023 — Per-Asset cash-flow tracking and return metrics](0023-per-asset-cash-flow-tracking-and-return-metrics.md)
- GitHub issue `#33`

# 0006: Investments and Transactions are separate features, not one unified model

## Status

Accepted — 2026-07-21

## Context

Vantage will eventually cover two kinds of financial data: investment
positions (brokerage/savings accounts) and bank/transaction data (payslips,
credit cards, bank statements). These could be modeled as one unified
"financial record" abstraction, or as two distinct features.

## Decision

**Investments** is being built first: snapshot-based, point-in-time positions
per account, reconstructed from quarterly (or similar) reports. **Bank /
Transactions** is deliberately deferred — naturally transaction/line-item
based, a different shape of data than investment positions — and is not
designed in detail yet. Only a UI placeholder and a generic import "front
door" ([0013](0013-shared-ingestion-front-door.md)) exist for it today.

## Alternatives Considered

- **One unified data model covering both** — rejected. Snapshot-based
  point-in-time positions and transaction/line-item data are genuinely
  different shapes; forcing them into one abstraction now, before
  Transactions is even designed, risks a speculative abstraction that fits
  neither well.

## Consequences

- `User`, `Account`, and `Institution` are expected to be reused by
  Transactions later; `Snapshot`/`Holding` are Investments-specific and
  should not be assumed to generalize.
- The import pipeline's shared/not-shared split
  ([0013](0013-shared-ingestion-front-door.md)) exists specifically to make
  room for Transactions later without a rewrite of the ingestion front door.
- The frontend nav includes a disabled "Coming soon" placeholder for
  Transactions (see [0001](0001-system-architecture.md)), signaling intent
  without committing to a design.

## Related

- [0001 — System Architecture](0001-system-architecture.md)
- [0013 — Shared ingestion front door](0013-shared-ingestion-front-door.md)
- `docs/DOMAIN.md`

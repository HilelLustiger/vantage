# 0013: Shared ingestion front door, feature-specific extraction

## Status

Accepted — 2026-07-21

## Context

Both Investments (building now) and the future Transactions feature
([0006](0006-investments-and-transactions-are-separate-features.md)) need
file upload, storage, and Document metadata handling. But their
parsing/extraction logic and resulting domain models are genuinely different
shapes of data.

## Decision

**Shared across both features:** a feature-agnostic ingestion layer — file
upload, storage, and Document metadata (source/provider, document type, date
range, checksum for de-dup, which feature it belongs to).

**Not shared:** parsing/extraction logic and the resulting domain model.
Investments and Transactions each get their own extraction logic entirely —
no shared "extraction engine," since that would be a speculative abstraction
before a second real use case (Transactions) even exists in detail.

## Alternatives Considered

- **One shared extraction engine for both features** — rejected: Transactions
  isn't designed yet, and guessing at a shared abstraction now risks building
  the wrong one — the classic premature-abstraction trap of designing for a
  feature you haven't actually built yet.
- **No shared layer at all (each feature owns its own upload/storage)** —
  rejected: file upload, storage, and checksum-based dedup are genuinely
  identical needs across features; duplicating that logic would be pure
  repetition with no benefit.

## Consequences

- `Document` (the shared model) must carry a "which feature does this belong
  to" field from day one, even though only Investments uses it today.
- When Transactions is eventually designed, it plugs into the existing front
  door rather than requiring a new upload/storage path.
- The parser registry ([0014](0014-parser-registry-generic-dispatch.md)) is
  scoped to Investments' extraction logic only — Transactions will need its
  own registry/dispatch design later, not a shared one.

## Related

- [0006 — Investments and Transactions are separate features](0006-investments-and-transactions-are-separate-features.md)
- [0011 — Document lifecycle](0011-document-lifecycle-separate-state-machine.md)
- [0014 — Per-(institution, format) parser registry](0014-parser-registry-generic-dispatch.md)

# 0016: No special "backfill mode" — just the same pipeline, run repeatedly

## Status

Accepted — 2026-07-21

## Context

The household wants 3-5 years of historical quarterly reports imported, not
just going-forward statements. Historical backfill could be treated as a
distinct operation from day-to-day imports.

## Decision

**No special backfill mode.** It's the same single-document pipeline, just
run repeatedly — Snapshots don't need to be inserted in chronological order
([0009](0009-snapshot-immutability-and-supersede.md) doesn't require it). The
only affordance worth adding is **multi-file upload** (select/drag many PDFs
at once) as a UI convenience.

## Alternatives Considered

- **A dedicated bulk-backfill import mode** (e.g. a separate flow that
  processes a batch atomically, or infers ordering) — rejected: since
  Snapshots are independent, date-stamped, immutable records
  ([0009](0009-snapshot-immutability-and-supersede.md)), there's no ordering
  dependency for a special mode to manage. Building one would duplicate the
  single-document pipeline for no functional benefit.

## Consequences

- Importing 3-5 years of history is just "upload N files," each going through
  the identical `Uploaded → Processing → NeedsReview/Committed/Failed`
  pipeline ([0011](0011-document-lifecycle-separate-state-machine.md)).
- Multi-file upload UI is the only backfill-specific work item (tracked as an
  M1 issue) — everything else reuses existing pipeline behavior.

## Related

- [0009 — Snapshot immutability and supersede](0009-snapshot-immutability-and-supersede.md)
- [0011 — Document lifecycle](0011-document-lifecycle-separate-state-machine.md)
- GitHub milestone **M1 — Frontend**, issue "Document upload UI (multi-file) + status list"

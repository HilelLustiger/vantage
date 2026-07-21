# 0009: Snapshots are immutable; corrections supersede rather than overwrite

## Status

Accepted — 2026-07-21

## Context

A Snapshot records an Account's Holdings as of a specific date, produced by
importing a Document. Sometimes an import needs correcting — e.g. a
mis-scanned statement re-imported after fixing the source file. For a
financial "source of truth," being able to trace which document produced
which number matters.

## Decision

Snapshots are **immutable once created** — never edited in place.
Re-importing for the same Account + as-of-date is handled as an explicit
**supersede**, not an overwrite:

- `is_active: boolean` on Snapshot.
- `superseded_by_snapshot_id`: nullable reference to the Snapshot that
  replaced it, set only when `is_active` flips to `false`.

Exact duplicate re-uploads are auto-detected via file checksum and rejected
as `Duplicate` (see
[0011 — Document lifecycle](0011-document-lifecycle-separate-state-machine.md)) —
never silently reprocessed.

## Alternatives Considered

- **Edit Snapshots in place** — rejected: loses the audit trail of which
  document produced which number, which is the whole point of a financial
  source of truth. A corrected import should be traceable as a distinct
  event, not an invisible mutation.

## Consequences

- Every read of "current" Snapshot data must filter on `is_active`, and every
  write that supersedes a Snapshot must do so atomically (flip `is_active`,
  set `superseded_by_snapshot_id`, insert the new Snapshot).
- Superseded Snapshots are kept forever for audit history — no cleanup/GC job
  is anticipated.
- `docs/DOMAIN.md` reserves "Outdated snapshot" for a different, not-yet-built
  concept (a Snapshot that's simply old because no newer import has happened
  yet) — don't conflate it with "Superseded."

## Related

- `docs/DOMAIN.md` — Snapshot, Active Snapshot, Superseded Snapshot
- [0011 — Document lifecycle is a separate state machine](0011-document-lifecycle-separate-state-machine.md)

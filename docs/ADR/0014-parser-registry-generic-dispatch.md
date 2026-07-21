# 0014: Per-(institution, format) parser registry, generic dispatch, one concrete parser first

## Status

Accepted — 2026-07-21

## Context

Every financial institution formats its statements differently. With AI
excluded from v1 ([0007](0007-ai-excluded-from-v1.md)), there's no
intelligent fallback to handle format variation — a generic/heuristic
"universal parser" would risk silently misreading financial data, the worst
possible failure mode here.

## Decision

A **per-(institution, format) parser registry** behind a **generic dispatch
interface**. Each institution+format gets its own small, dedicated parser
module; unrecognized formats fail loudly (`Failed` state — see
[0011](0011-document-lifecycle-separate-state-machine.md)) rather than
guessing.

The registry's **shape** (generic interface, keyed by institution + format)
is built generically from day one — this costs almost nothing and avoids a
pipeline refactor when a second parser is added. But only **one concrete
parser** (one institution, PDF format) is actually built and proven
end-to-end first, before any second parser or format is added.

## Alternatives Considered

- **Universal/heuristic parser** — rejected: without AI to handle format
  variation intelligently, a "best-effort" generic parser risks silent
  misreads on financial data, which is unacceptable for a source-of-truth
  application.
- **Build multiple parsers up front, speculatively** — rejected: the registry
  shape is cheap to generalize now, but the parsers themselves are real work;
  building more than one before the first is proven end-to-end would be
  speculative effort against unvalidated assumptions about what the
  interface actually needs to support.

## Consequences

- Adding a new institution/format later means writing one new parser module
  against an already-proven interface — not touching the pipeline itself.
- Until a second parser exists, some of the registry's generality is
  unexercised — a known, accepted trade-off, not an oversight.
- Every parser must map its output onto the shared Document/Snapshot/Holding
  model — see
  [0011](0011-document-lifecycle-separate-state-machine.md) and
  [0009](0009-snapshot-immutability-and-supersede.md).

## Related

- [0003 — Separate Python parsing service](0003-separate-python-parsing-service.md)
- [0007 — AI excluded from v1](0007-ai-excluded-from-v1.md)
- [0011 — Document lifecycle](0011-document-lifecycle-separate-state-machine.md)
- [0015 — PDF first, CSV later](0015-pdf-first-csv-later.md)
- GitHub milestones **M3 — Ingest module** and **M4 — Parser service**

# 0011: Document lifecycle is a separate state machine from Snapshot lifecycle

## Status

Accepted — 2026-07-21

## Context

An uploaded file goes through its own processing journey (received, parsed,
possibly blocked on review) which is conceptually distinct from whether the
Snapshot it eventually produces is active or superseded
([0009](0009-snapshot-immutability-and-supersede.md)). Conflating the two
would make it unclear what a given status flag is actually describing.

## Decision

`Document` has its own lifecycle, independent of `Snapshot`'s:

| State | Meaning |
|---|---|
| `Uploaded` | File received, not yet processed. |
| `Processing` | Python parsing service is working on it. |
| `NeedsReview` | Parsed, but has Assets that couldn't be auto-matched — waiting on manual confirmation. |
| `Committed` | Successfully processed; reflected in an active Snapshot. |
| `Failed` | Parsing errored out (unreadable file, unrecognized format). |
| `Duplicate` | Checksum matched an already-imported document; auto-rejected. |

## Alternatives Considered

- **One combined Document+Snapshot state** — rejected: a Document can fail or
  need review before any Snapshot exists at all, and a Snapshot's
  active/superseded status can change *after* its Document is already
  `Committed`. Merging them would force awkward states like "Document is
  Committed but Snapshot is inactive" to be represented as if they were the
  same axis.

## Consequences

- `docs/ingest` (see
  [0002](0002-single-backend-service-with-api-ingest-modules.md)) owns driving
  these transitions; `api` only reads Document state to show upload/status UI.
- Every institution/format parser
  ([0014](0014-parser-registry-generic-dispatch.md)) must map its outcomes
  onto exactly these six states — no ad hoc additional states per parser.

## Related

- [0009 — Snapshot immutability and supersede](0009-snapshot-immutability-and-supersede.md)
- [0010 — Asset resolution requires manual confirmation](0010-asset-resolution-requires-manual-confirmation.md)
- [0002 — Single backend service with API/Ingest module split](0002-single-backend-service-with-api-ingest-modules.md)
- `docs/DOMAIN.md` — Document

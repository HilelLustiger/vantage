# 0004: Domain model core — Asset registry, Snapshot lifecycle, Document lifecycle, asset resolution

## Status

Accepted — 2026-09-10 (consolidates the original 0008-global-asset-registry,
0009-snapshot-immutability-and-supersede,
0010-asset-resolution-requires-manual-confirmation, and
0011-document-lifecycle-separate-state-machine)

## Context

Four entities anchor the domain: `Asset` (a tradable thing that can be
held), `Snapshot` (an Account's Holdings as of a date), `Document` (the
imported file a Snapshot is derived from), and the process of matching a
parsed line to an `Asset`. Each needed a real decision about identity,
mutability, and trust — this is a financial source-of-truth application,
where a silent misread or a silently duplicated record is the worst
possible failure mode.

## Decision

**`Asset` is a global, shared registry — not per-Account or
per-Institution.** The same tradable Asset (e.g. Apple stock) held across
multiple Accounts, possibly at different Institutions, is one registry
entry, matched across imports by ticker/ISIN (and, per the ingestion
pipeline's own evolution, `securityNumber` — see 0007) when available. Each
Asset has a `type` (Stock, ETF, Mutual Fund, Bond, Cash, ...) captured at
import time, since it's expensive to retrofit. A fund is one Asset, never
decomposed into underlying holdings. (Named "Asset," not "Security,"
specifically to avoid colliding with the app's own security/auth
architecture — see 0003.)

**Snapshots are immutable once created — never edited in place.**
Re-importing for the same Account + as-of-date is an explicit **supersede**,
not an overwrite: `is_active: boolean`, and `superseded_by_snapshot_id`
(nullable, set only when `is_active` flips false). Exact duplicate
re-uploads are auto-detected via file checksum and rejected as `Duplicate`,
never silently reprocessed.

**Asset resolution requires manual confirmation — the registry never
auto-creates.** The parser attempts automatic matching by ticker/ISIN/
securityNumber; unmatched or apparently-new Assets hold the Document in
`NeedsReview` until a human confirms each line as either "an existing Asset
under a different name" or "genuinely new." A merge/cleanup tool for
accidentally-duplicated Assets is explicitly deferred, not part of the
initial build.

**`Document` has its own lifecycle, independent of `Snapshot`'s**, since a
Document can fail or need review before any Snapshot exists, and a
Snapshot's active/superseded status can change after its Document is
already `Committed`:

| State         | Meaning                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Uploaded`    | File received, not yet processed.                                                                                           |
| `Processing`  | The parser is working on it.                                                                                                |
| `NeedsReview` | Needs a human — an unmatched Asset, a validity/completeness failure, or (per 0008) an AI-extraction privacy guard tripping. |
| `Committed`   | Successfully processed; reflected in an active Snapshot (or, for a flows-only import, in `cash_flows` — see 0006).          |
| `Failed`      | Parsing errored out (unreadable file, unrecognized format).                                                                 |
| `Duplicate`   | Checksum matched an already-imported document; auto-rejected.                                                               |

`backend` owns driving these transitions as a real domain entity (state
machine, no DB awareness, with a separate repository) — `parser`
(0001, 0008) computes results but never decides a transition itself.

## Alternatives Considered

- **Per-Account or per-Institution Asset records** — rejected: would prevent
  the cross-account aggregation that's the dashboard's core value, requiring
  a de-duplication/merge layer to reconstruct what the global registry gives
  for free.
- **Decomposing funds into underlying holdings** — rejected as unnecessary
  complexity until there's a concrete need to look inside one.
- **Edit Snapshots in place** — rejected: loses the audit trail of which
  document produced which number, the whole point of a financial source of
  truth.
- **Auto-create new Assets on any unmatched line, or fuzzy/heuristic
  auto-matching** — rejected: would silently fragment the registry's
  cross-account aggregation with no signal, or risk a wrong automatic match
  on financial data — worse than one manual confirmation click.
- **One combined Document+Snapshot state** — rejected: would force awkward
  states like "Document is Committed but Snapshot is inactive" onto what are
  really two independent axes.

## Consequences

- Import must resolve each parsed line to an existing Asset or a genuinely
  new one; accidentally-duplicated Assets are possible and cleanup is
  out of scope until proven necessary.
- Every read of "current" Snapshot data filters on `is_active`; every write
  that supersedes one does so atomically. Superseded Snapshots are kept
  forever for audit history.
- Every import of a previously-unseen Asset blocks on a human action — a
  deliberate speed/safety trade-off, acceptable given import volume
  (quarterly reports for a couple of accounts, not high-frequency data).
- Every institution/layout parser must map its outcomes onto exactly the
  six Document states above — no ad hoc additional states per parser.

## Related

- 0001 — System architecture & service topology
- 0007 — Ingestion pipeline architecture
- 0008 — Parser generalization & AI-assisted extraction
- `docs/DOMAIN.md` — Asset, Holding, Snapshot, Active/Superseded Snapshot, Document

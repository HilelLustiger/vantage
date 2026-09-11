# 0007: Ingestion pipeline architecture — file import, registry, and content-driven detection

## Status

Accepted — 2026-09-10 (consolidates the original 0005-file-import-based-ingestion,
0013-shared-ingestion-front-door, 0014-parser-registry-generic-dispatch,
0015-pdf-first-csv-later, 0016-no-special-backfill-mode,
0021-automatic-institution-account-detection, and
0025-document-type-and-layout-split-from-format)

## Context

Vantage needs to know the state of accounts held at external institutions
that mostly don't provide public APIs a personal project could realistically
integrate against, and third-party account-aggregators would mean routing
financial data through an external service — a bad fit for a privacy-first,
single-household project (0002). Every institution formats its statements
differently, and with no probabilistic fallback to lean on for the core
pipeline, a generic/heuristic "universal parser" risks silently misreading
financial data — the worst possible failure mode here.

A deterministic-detection spike (code in `sandbox/`) tested whether requiring the user to manually pick an
Account at upload could instead be inferred from a document's own content.
Against 8 real statements spanning 3 institutions and 2 document families:
7 of 8 extracted correctly using a small keyword/label-matching registry
(~40 lines of regex per institution); the 1 unrecognized document correctly
produced "no matching parser" rather than a wrong guess; a joint account
(two names on one statement) extracted correctly. Two real bugs surfaced and
were fixed (a loose number regex matching a stray Hebrew punctuation comma;
negative percentages rendering with a _trailing_ minus in RTL context); a
third (a footnote digit merging into an adjacent date) was identified and
left for follow-up hardening. Separately: `pdfplumber` extracts Hebrew/RTL
text in visual glyph order, not logical order — `python-bidi` fixes this
reliably as a post-processing step.

Later, the parser-generalization design work needed settled vocabulary:
today's registry key, "format," was quietly carrying two independent things
at once — file encoding (PDF vs. CSV) and report shape (which fields/tables
are present and how they're arranged, the axis that actually drifts and
that the declarative template approach in 0008 is meant to isolate).

## Decision

**Ingestion is file-import-based, not live institution APIs.** The system
ingests documents downloaded by the user (PDF now, CSV later — see below)
rather than pursuing live integrations.

**Shared ingestion front door, feature-specific extraction.** File upload,
storage, and Document metadata (source/provider, document type, date range,
checksum for de-dup) are handled by one feature-agnostic layer. Historically
this split was justified partly by leaving room for a second feature
(Transactions) to plug into the same front door later — that motivation no
longer applies since Transactions is permanently out of scope (0002), but
the split still stands on its own merits: it's simply cleaner separation of
concerns within Investments' own pipeline.

**A per-(Institution, Document type, Layout) parser registry behind a
generic dispatch interface.** `Document type` is the file encoding (PDF,
CSV); `Layout` is the report's field/table shape for a given Institution and
Document type (e.g. a yearly Gemel report vs. a quarterly one) — the two are
kept as separate `Signature` parameters rather than one overloaded `format`,
so a Layout-level template can be shared across Document types instead of
treating a CSV export and a PDF of the same report period as unrelated. Each
recognized combination gets its own small, dedicated parser module;
unrecognized ones fail loudly (the `Failed` Document state — 0004) rather
than being guessed at. The registry's shape is generic from day one (cheap,
avoids a pipeline refactor later); only one concrete parser was built and
proven end-to-end before any second one was added.

**PDF first; CSV fits the same registry later** as just another Document
type — a low-cost deferral specifically because the registry above is
already format-agnostic.

**No special "backfill mode."** Importing years of historical statements is
the same single-document pipeline, run repeatedly — Snapshots don't need to
be inserted in chronological order (0004). The only backfill-specific
affordance is multi-file upload as a UI convenience.

**Document upload is content-driven, not account-selection-driven.** The
user uploads a file; the system detects which Institution and Account it
belongs to from the file's own text, using **deterministic** signature
matching (never AI, never a universal/heuristic parser) — the same
`Signature` mechanism the registry above uses, extended with a
confidence tier mirroring asset resolution's own precedent (0004): a
confident match (institution signature hits, an account-identifying
fragment matches exactly one Account) proceeds automatically; anything
uncertain — no institution match, or an account fragment matching zero or
multiple Accounts — holds the Document for human confirmation instead of
failing outright or silently guessing. Detection lives in `parser`
(Python), not `backend` — it needs the PDF's actual text content, the same
ecosystem-boundary reasoning as parsing generally (0001). It's still one
small parser module per (Institution, Document type, Layout), not a
separate universal classifier layered on top.

## Alternatives Considered

- **Live API integrations** (e.g. Plaid-style aggregation) — rejected: most
  relevant institutions don't expose public APIs, and third-party
  aggregators conflict with the project's privacy stance.
- **One shared extraction engine across features** — rejected while
  Transactions still theoretically existed: guessing at a shared
  abstraction before a second real use case existed in detail risked
  building the wrong one. Moot now that Transactions is dropped, but the
  underlying caution (don't share what only one feature actually needs)
  still applies to the front-door/extraction split above.
- **No shared ingestion layer at all** — rejected: file upload, storage, and
  checksum-based dedup are identical needs; duplicating them would be pure
  repetition.
- **Universal/heuristic parser** (with or without AI) — rejected: without a
  hard guarantee against silent misreads, "best-effort" parsing is
  unacceptable on financial data. (AI-_assisted_ extraction, scoped
  narrowly, is a separate later decision — see 0008.)
- **Build multiple parsers up front, speculatively** — rejected: the
  registry shape is cheap to generalize now, but parsers themselves are real
  work against unvalidated assumptions about what the interface needs to
  support.
- **Build CSV support alongside PDF from the start** — rejected: unconfirmed
  need for this household's specific institutions.
- **A dedicated bulk-backfill import mode** — rejected: no ordering
  dependency exists for a special mode to manage, since Snapshots are
  independent, date-stamped, immutable records.
- **Keep manual account selection at upload** — rejected: the spike showed
  automatic detection is achievable without compromising the fail-loud
  safety property.
- **Silent, unconfirmed auto-detection** (trust any match, no review
  fallback) — rejected: a wrong silent institution/account match is the
  worst failure mode this system can produce.
- **Keep "format" as one overloaded dimension** — rejected: conflating file
  encoding with report shape made Layout-level template reuse (0008)
  awkward to express.

## Consequences

- `Document` (the shared front-door model) carries a checksum for de-dup and
  the fields needed for content-driven detection below, even though only
  Investments uses this front door today.
- Adding a new institution/format later means writing one new parser module
  against an already-proven interface, not touching the pipeline itself.
  Until a second parser exists, some registry generality is unexercised — a
  known, accepted trade-off.
- Upload's `accountId` becomes optional/derived rather than required;
  `Institution` gets a content-detection signature, `Account` gets an
  identifying fragment (e.g. a masked account number) for disambiguation.
  "Institution/account ambiguous, needs confirmation" reuses the
  `NeedsReview` Document state (0004), not a bolted-on state.
- Importing years of history is just "upload N files," each through the
  identical pipeline; multi-file upload is the only backfill-specific UI
  work.
- Per-institution signatures and label patterns are real, ongoing
  work — extraction quality needs continued troubleshooting per
  institution/layout, not a one-time effort.

## Related

- 0001 — System architecture & service topology
- 0002 — Product scope & governance
- 0004 — Domain model core
- 0006 — Cash-flow tracking & return metrics
- 0008 — Parser generalization & AI-assisted extraction
- `sandbox/` — the Phase 0 spike scripts and findings
- `docs/DOMAIN.md` — Signature, Document type, Layout
- Open question: whether CSV import will actually be needed (see the ADR index)

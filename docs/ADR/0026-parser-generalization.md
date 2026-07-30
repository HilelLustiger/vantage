# 0026: Parser generalization — declarative DocumentTemplate replaces per-institution modules

## Status

Proposed — 2026-07-30

## Context

Today, each (Institution, Layout) is a bespoke Python module in `apps/parser`
(`gemel.py`, `hapoalim.py`, `excellence.py`, `hapoalim_transactions.py`) —
regex-over-flattened-text, ~450 lines total, dispatched through ADR-0014's
per-(institution, format) registry. The real pain isn't "we need more
institutions," it's that a report layout shifts slightly (a relabeled field,
a reordered column between yearly/quarterly templates) and every such shift
means hand-editing regex control flow inside one of these modules.

A design sketch (`docs/private-docs/parser-generalization.md`, gitignored —
same process this repo already used for auto-institution-detection before
ADR-0021: sketch first, real ADR before touching `apps/parser` production
code) explored separating **layout** (which label/column holds which value
— this is what drifts) from **meaning** (reconciliation math, unit
conversion — institution-specific, doesn't drift). Layout becomes
declarative data; meaning stays small, explicit Python.

A validation pass against real samples (`sandbox/samples/`) tested that
sketch's assumptions and found them half right:

- Default (line-based) table detection finds nothing on these PDFs — they're
  borderless, whitespace-delimited layouts. `pdfplumber`'s
  `vertical_strategy: "text", horizontal_strategy: "text"` settings
  (already known from the Phase 0 spike) are required to get anything at
  all.
- `pdfplumber` does **not** return several small, clean tables per page —
  it returns **one large, noisy table per page**, real data mixed in with
  header/logo/disclaimer text. That page-wide noise pollutes column
  detection for everything on the page.
- Cropping the page down to just the relevant region **before** running
  table extraction — not extracting over the whole page and filtering noise
  out afterward — is what actually produces clean results.
- This disproved two original assumptions: a `locate()` step that picks the
  right table out of *several* candidates (there's only ever one, page-wide
  and noisy), and a separate label-cell/value-cell matcher (a clean 2-cell
  split mostly doesn't exist — a label and its value almost always land
  back together in one plain text line once cropped to the right region,
  making a second mechanism redundant with plain regex matching).
- Further validation surfaced a general, mechanism-level rule rather than a
  per-document judgment call: a regex match against one line of text isn't
  corrupted by unrelated content elsewhere on the page (this is exactly how
  `gemel.py` already works today, in production, with zero page-region
  scoping — its one real documented bug was fixed by tightening the
  pattern, never by narrowing the search area). Table/column detection,
  by contrast, *infers* structure from everything on the page at once, and
  that inference is what page-wide noise corrupts — structurally, for any
  document. So: label/value field matching never needs a cropped region;
  genuine multi-column table extraction always does.

## Decision

Replace each per-institution Python module with a declarative
`DocumentTemplate` — one per (Institution, Document type, Layout), per
ADR-0025 — interpreted by one generic `ExtractionEngine`, plus a shared
`ValidityChecks` module.

- **`SectionSpec`**: a bounded page region, located by its own heading text
  and cropped out before any extraction runs inside it. Used exclusively by
  `TableSpec`, never by `FieldSpec`, per the general rule above. A
  section's region runs from its own `start_marker` to the next
  `SectionSpec`'s `start_marker` (in declaration order), or to the page
  bottom for the last one.
- **`FieldSpec`**: a value matched by regex against whole-page text lines —
  always whole-page. `required: bool = True` and `default: Any = None`
  control what happens when no pattern matches: required fields make the
  whole Document need review; optional ones fall back to `default` and
  extraction continues (e.g. Gemel's transfers/withdrawals, which default
  to 0.0 so a statement with no transfer-in activity still reconciles).
- **`ColumnSpec`** / **`TableSpec`**: a repeating-row table (holdings,
  transactions), columns located by header text, not raw position.
  `section` is required (unlike `FieldSpec`). No `locate()` callable —
  once cropped to its section, `ExtractionEngine` finds the header row via
  `column.header_patterns` and trims to the contiguous rows that follow
  with a matching cell count; that trimming rule is generic, not
  institution-specific, so it lives in the engine. `required` works like
  `FieldSpec.required`, but for "this table's marker wasn't found, or was
  found with zero rows" — e.g. Excellence's optional transactions table,
  only present when there was activity that period (ADR-0024); an absent
  optional table is just `[]`, not a review-worthy problem.
- **`ExtractionEngine.extract(page, template)`**: written once, generically,
  against the shapes above — every institution's template runs through the
  same code path. Includes a completeness gate: any required
  `FieldSpec`/`TableSpec` missing produces a `ValidityFailure` immediately,
  before `template.reconcile` ever runs on incomplete data.
- **`ValidityChecks`**: one shared primitive,
  `verify_matches(name, computed, claimed, tolerance) -> ValidityResult` —
  does a value derived from other extracted numbers agree with what the
  statement itself claims, within tolerance? Every institution-specific
  check (Gemel's balance identity, Excellence's running-balance check, a
  return-% sanity check) derives its own `computed` side differently and
  calls this directly — no named per-shape wrappers. Plus
  `compute_return_pct` and `summarize_by_kind` as supporting helpers.
  `DEFAULT_TOLERANCE = 1.0`, one flat constant used everywhere, meant only
  to absorb float noise from parsing/summing strings, not to paper over
  real discrepancies.
- **`ValidityResult`** / **`ValidityFailure`**: one unified failure
  vocabulary for both "a check didn't match" and "a required field/table
  was missing" — `ValidityResult`'s `computed`/`claimed` are nullable
  specifically to represent the latter. A `ValidityFailure` routes the
  Document to `needs_review`, the same state ADR-0010/0021 already use for
  other kinds of uncertainty, carrying the raw extracted values forward —
  on success they're discarded, on failure they're exactly what a future
  manual-correction form (not designed here) would show the user to edit
  or fill in.
- **Output principle**: the final dict always includes everything
  successfully extracted, required or optional — the engine never filters
  based on what today's backend happens to read. That judgment belongs
  entirely on the other side of the ADR-0003 parser/backend boundary, same
  separation of concerns ADR-0006/0013 already draw.
- **`document_type`** is a real field on `DocumentTemplate` now (`"pdf"`
  today, per ADR-0025) even though only one value exists yet — preparation
  for CSV (ADR-0015) as a new `document_type` rather than a second,
  untyped axis bolted on later.

## Alternatives Considered

- **Universal/heuristic parser** — already rejected by ADR-0014; not
  reconsidered here.
- **A separate label-cell/value-cell matcher (`TableKeyValueSpec`)** —
  rejected: validated against real samples, a label and its value almost
  always land back in one plain text line once correctly scoped, so a
  second mechanism added no real capability `FieldSpec` didn't already
  have.
- **`TableSpec.locate()` picking the right table out of several
  candidates** — rejected: `pdfplumber` never returns several; there's
  exactly one, page-wide, noisy table per page. The real fix is a cropped
  region, not a selection among options.
- **Named check wrappers** (`verify_balance`/`verify_running_balance`) —
  rejected: every one of them reduced to the same "does a derived value
  match a claimed one, within tolerance" primitive. The only real
  difference was how the derived side got computed, which belongs in each
  institution's own `reconcile`, not a family of near-duplicate functions.
- **Scoping `FieldSpec` to a section too, symmetric with `TableSpec`** —
  rejected: the one real documented `gemel.py` bug was fixed by tightening
  a regex pattern, not narrowing search scope. A line-regex match doesn't
  share `TableSpec`'s actual failure mode (structural inference corrupted
  by page-wide content), so scoping it would add a moving part without
  addressing a real risk.

## Consequences

- `apps/parser/registry.py` needs to dispatch on the 3-tuple (Institution,
  Document type, Layout) instead of ADR-0014's original (institution,
  format) 2-tuple — tracked in `#50`.
- `apps/backend/src/ingest` needs a new `needs_review` path for
  `ValidityFailure` — tracked in `#51`.
- Four `DocumentTemplate`s replace the four existing hand-written modules
  — tracked in `#52`/`#53`/`#54`/`#55`; old modules retired only once all
  four are live (`#56`).
- A future manual-correction form (letting a user fill in values a
  Document couldn't extract) is implied by `ValidityFailure`'s shape but
  explicitly not designed here — separate, future work.
- Confirms via real testing something left open by ADR-0021's Phase 0
  spike: `pdfplumber`'s table detection needs deliberate region-scoping to
  be usable on these documents at all, not just the settings tweak the
  spike already found.

## Related

- [0003 — Separate Python parsing service](0003-separate-python-parsing-service.md)
- [0007 — AI excluded from v1](0007-ai-excluded-from-v1.md)
- [0010 — Asset resolution requires manual confirmation](0010-asset-resolution-requires-manual-confirmation.md)
- [0011 — Document lifecycle](0011-document-lifecycle-separate-state-machine.md)
- [0014 — Parser registry, generic dispatch](0014-parser-registry-generic-dispatch.md)
- [0015 — PDF first, CSV later](0015-pdf-first-csv-later.md)
- [0021 — Automatic institution/account detection](0021-automatic-institution-account-detection.md)
- [0023 — Per-Asset cash-flow tracking and return metrics](0023-per-asset-cash-flow-tracking-and-return-metrics.md)
- [0024 — Ingesting per-transaction statement formats](0024-ingesting-per-transaction-statement-formats.md)
- [0025 — Document type and Layout split from format](0025-document-type-and-layout-split-from-format.md)
- `docs/private-docs/parser-generalization.md` — the design sketch this
  ADR formalizes
- GitHub issues `#46`–`#56` (M6 milestone)

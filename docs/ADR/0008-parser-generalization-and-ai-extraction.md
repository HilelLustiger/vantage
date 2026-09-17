# 0008: Parser generalization & AI-assisted extraction

## Status

Accepted — 2026-09-10 (consolidates the original 0007-ai-excluded-from-v1,
0026-parser-generalization, and 0029-ai-reintroduced-scoped-to-extraction)

## Context

AI could plausibly help with document parsing or Asset matching, but this is
a financial source-of-truth application where a silent misread is the worst
possible failure mode — AI was excluded from v1 for exactly that reason, as
an explicit, revisit-later (not permanent) decision.

Each (Institution, Layout) started as a bespoke Python module — regex over
flattened text, dispatched through the registry (0007). The real pain
wasn't "more institutions," it was that a report layout shifting slightly
(a relabeled field, a reordered column) meant hand-editing regex control
flow inside one of these modules. A design sketch explored separating
**layout** (which label/column holds which value — what drifts) from
**meaning** (reconciliation math, unit conversion — institution-specific,
doesn't drift), making layout declarative data. Validated against real
samples: `pdfplumber` needs `text`-strategy table detection on these
borderless, whitespace-delimited PDFs, and returns **one large, noisy table
per page**, not several clean candidates — cropping to the relevant region
_before_ extraction, not filtering noise out after, is what actually works.
A regex match against one line of text, by contrast, isn't corrupted by
unrelated page content the way table/column inference is — a
mechanism-level rule, not a per-document judgment call.

That generalization delivered a real engineering improvement, but the layer
that's actually hard to generalize — labels and table shapes that vary by
institution's own wording — stayed 100% regex. Revisiting AI-exclusion
against that specific gap, under a hard constraint: financial data must not
reach a third-party model provider unredacted.

## Decision

**Declarative `DocumentTemplate`, one per (Institution, Document type,
Layout — 0007), interpreted by one generic `ExtractionEngine`, plus a shared
`ValidityChecks` module:**

- **`SectionSpec`** — a bounded page region, located by its own heading text,
  cropped out before any extraction runs inside it. Used exclusively by
  `TableSpec`, never `FieldSpec` (see the mechanism-level rule above). A
  section's region runs from its own `start_marker` to the next
  `SectionSpec`'s (in declaration order), or the page bottom for the last
  one.
- **`FieldSpec`** — a value matched by regex against whole-page text lines,
  always whole-page. `required: bool` controls whether a no-match produces a
  `ValidityFailure` or falls back to a `default`.
- **`ColumnSpec` / `TableSpec`** — a repeating-row table, columns located by
  header text, not raw position; `section` is required. `ExtractionEngine`
  finds the header row and trims to contiguous matching rows — a generic
  rule, not institution-specific.
- **`ExtractionEngine.extract(page, template)`** — one implementation for
  every institution's template, with a completeness gate: any required
  `FieldSpec`/`TableSpec` missing produces a `ValidityFailure` before
  `template.reconcile` ever runs on incomplete data.
- **`ValidityChecks`** — one shared primitive,
  `verify_matches(name, computed, claimed, tolerance)`, used by every
  institution-specific check rather than named per-shape wrappers; plus
  `compute_return_pct`/`summarize_by_kind` helpers.
- **`ValidityResult` / `ValidityFailure`** — one unified failure vocabulary
  for "a check didn't match" and "a required field/table was missing"
  (`computed`/`claimed` nullable for the latter). A `ValidityFailure` routes
  to `NeedsReview` (0004), carrying the raw extracted values forward for the
  manual-correction form described below.

**AI is reintroduced, scoped specifically to this extraction layer** — not
asset resolution (0004's manual-confirmation requirement is untouched), not
a general "add AI" mandate:

- **Two-tier extraction.** Identity fields (account holder name, ID number,
  account number) continue to be matched locally via `FieldSpec` regex and
  never leave `parser`. Fields genuinely hard to generalize (balance labels
  that vary by wording, holdings/transaction tables) are what gets sent to
  an LLM.
- **Allowlist, not redaction, for what leaves the machine** — built from
  `SectionSpec`: each `DocumentTemplate` marks which sections are allowed to
  leave the machine; the outbound buffer is the concatenation of only those
  sections' cropped text. Structural exclusion, not filtering-after-the-fact
  — a section not marked allowlisted never has its text copied into the
  buffer at all. Sections known to hold identity information are simply
  never marked allowlisted. A missed _inclusion_ fails safe (a field goes
  missing → the completeness gate → `NeedsReview`); a missed _exclusion_
  under a denylist approach would fail unsafe (a leak) — the entire reason
  for choosing allowlist over denylist.
- **Preflight, fail-closed leak check**, as defense in depth over the
  allowlist, not the primary control: scan the assembled outbound buffer for
  any 9-digit run passing the Israeli ID checksum, and assert none of the
  literal strings already captured by local identity `FieldSpec`s appear in
  it. Either check tripping aborts the LLM call entirely — no "best-effort
  redacted version" — and routes to `NeedsReview` via the same
  manual-correction path validity failures use, with a banner explaining the
  document was withheld from the external service rather than that
  something was wrong with it.
- **Local merge, unchanged trust gate.** Identity fields (local) and
  LLM-extracted fields (external) merge in-process inside `parser`; the
  existing `ValidityChecks`/`reconcile` deterministic gate runs on the
  merged values exactly as before.
- **Physical location**: this entire mechanism lives inside `parser`.
  `backend` never receives a raw document and is not part of this trust
  boundary at all (0001).
- **Not decided yet**: which specific model/provider, or whether a
  zero-data-retention enterprise agreement is an acceptable alternative to
  the allowlist+preflight design for a given field, versus self-hosting an
  open-weight model. The allowlist/preflight design is judged sufficient
  regardless of provider choice — the residual risk (de-identified financial
  amounts/fund names still leaving the machine) is accepted as within the
  household's risk tolerance.

## Alternatives Considered

- **A separate label-cell/value-cell matcher** — rejected: validated against
  real samples, a label and its value almost always land back in one plain
  text line once correctly scoped, so a second mechanism added no real
  capability `FieldSpec` didn't already have.
- **`TableSpec.locate()` picking the right table out of several
  candidates** — rejected: `pdfplumber` never returns several; a cropped
  region is the real fix, not selection among options.
- **Named check wrappers** per institution — rejected: every one reduced to
  the same tolerance-based comparison primitive.
- **Denylist / redaction of the full page** — rejected: a missed exclusion
  fails unsafe, versus a missed inclusion under an allowlist failing safe.
- **Best-effort send even if the preflight check trips** — rejected: turns a
  hard privacy guarantee into a soft one to avoid a `NeedsReview` detour;
  the manual-correction cost is accepted as worthwhile to keep the guarantee
  absolute.
- **A general "add AI" mandate covering asset resolution too** — rejected;
  0004's manual-confirmation requirement is untouched.

## Consequences

- The registry dispatches on the 3-tuple (Institution, Document type,
  Layout — 0007) instead of a 2-tuple; each hand-written module is replaced
  by one `DocumentTemplate`, retired only once its replacement is live and
  proven.
- A third `NeedsReview` reason now exists alongside asset-resolution
  ambiguity and validity/completeness failure: preflight-check abort. All
  three converge on one manual-correction screen shape (dual-pane: original
  document preview alongside an editable form), varying only in
  banner text and how pre-filled the form arrives.
- `DocumentTemplate` authors must explicitly mark which `SectionSpec`s are
  allowlisted per institution/layout — an omission is safe (field missing →
  review) but is per-template work, not a one-time global setting.
- `parser` gains a new external dependency (the chosen LLM provider) and new
  failure/latency modes the pipeline must handle.
- Document storage on local disk (`backend`'s own storage, unrelated to what
  `parser` sends externally) is unaffected — see 0002's note on why storing
  the raw file locally isn't a sensitivity compromise under this project's
  threat model.

## Related

- 0001 — System architecture & service topology
- 0004 — Domain model core
- 0007 — Ingestion pipeline architecture
- `parser/document_template.py` — `SectionSpec`, the mechanism the allowlist reuses
- Open question: LLM provider/self-hosting choice (see the ADR index)

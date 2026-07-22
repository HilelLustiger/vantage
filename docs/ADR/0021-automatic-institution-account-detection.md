# 0021: Automatic institution/account detection from statement content

## Status

Accepted — 2026-07-22

## Context

As built (`#14`), uploading a Document requires the user to pick which
Account it belongs to first; the Account's Institution (`#13`) is then
used to resolve the `(institution, format)` parser key (`#19`) before the
file is ever sent to the parser service. That's simple upload-side, but it
means "drop a file" isn't quite true — the user still has to tell the
system which account it's for, every time.

The alternative — detect institution and account from the file's own
content — runs into two existing decisions on its face:

- **ADR-0007** (AI excluded from v1) — rejects *probabilistic* parsing/
  matching (LLMs, fuzzy matching).
- **ADR-0014** (parser registry, generic dispatch) — rejects heuristic/
  universal parser fallback: unrecognized combinations must fail, never
  be guessed at.

Before deciding either way, a Phase 0 spike (`docs/private-docs/
auto-institution-detection.md`, code in `sandbox/`) tested whether
*deterministic* text extraction and keyword/label matching — not AI, not
universal guessing — could reliably identify institution, account, and
core statement data from real documents. Findings, against 8 real
statements spanning 3 institutions and 2 document families (Gemel
provident-fund statements and a bank brokerage/securities account
report):

- **7 of 8 documents extracted correctly** — institution, account holder
  identity, as-of date, and a holding value — using a ~2-parser registry
  keyed by institution keyword, each parser under ~40 lines of regex
  against `pdfplumber`-extracted text.
- **The 1 unrecognized document correctly produced "no matching parser"**
  rather than a wrong guess — the fail-loud behavior ADR-0014 already
  requires held up under a real, previously-unseen input.
- **A joint account (two names on one statement) extracted correctly**,
  matching the existing per-User Account ownership model
  (`docs/DOMAIN.md`).
- Two real bugs surfaced and were fixed during the spike: a loose number
  regex matched a bare Hebrew punctuation comma in unrelated footnote
  prose before reaching the real data line, and negative percentages
  render with a *trailing* minus (`5.65%-`) in RTL context instead of a
  leading one. A third, a footnote digit merging into an adjacent date
  (`130.06.2026` instead of `30.06.2026`), was identified but not fixed —
  a genuine PDF-extraction quirk, not a logic bug, left for follow-up
  hardening.
- Separately (not a detection question, but required to get any of the
  above readable at all): `pdfplumber` extracts Hebrew/RTL text in visual
  glyph order, not logical reading order. The Unicode bidi algorithm
  (`python-bidi`) fixes this reliably as a post-processing step.

## Decision

Document upload becomes **content-driven, not account-selection-driven**:
the user uploads a file; the system detects which Institution and Account
it belongs to from the file's own text, using **deterministic** signature
matching — not AI, not a universal/heuristic parser.

- **Detection lives in the `parser` service** (Python), not `ingest` — it
  needs the PDF's actual text content, the same ecosystem-boundary
  reasoning ADR-0003 already established for parsing generally.
- **Confidence-tiered, mirroring ADR-0010's Asset-resolution precedent**:
  a confident match (institution signature hits, account-identifying
  fragment matches exactly one Account) proceeds automatically. Anything
  uncertain — no institution match, or an account fragment matching zero
  or multiple Accounts — holds the Document for human confirmation
  instead of either failing outright or silently guessing. Never trust an
  uncertain automatic match on financial data.
- **Still one small parser module per (institution, format)**, per
  ADR-0014 — detection and data extraction are two jobs of that same
  per-institution module, not a separate universal classifier layered on
  top.

## Alternatives Considered

- **Keep manual account selection at upload** (status quo) — rejected:
  doesn't deliver the "drop a file, done" outcome; the Phase 0 spike
  showed automatic detection is achievable without compromising the
  fail-loud safety property.
- **AI/LLM-based document understanding** — still rejected, per ADR-0007.
  The spike didn't need it: deterministic keyword/label matching handled
  every recognized document correctly.
- **Silent, unconfirmed auto-detection** (trust any match, no review
  fallback) — rejected: a wrong silent institution/account match is the
  worst failure mode this system can produce (same reasoning as
  ADR-0007/0010/0014). The confidence-tiered fallback keeps the common
  case automatic without accepting that risk.

## Consequences

- `#14`'s upload endpoint: `accountId` becomes optional/derived instead
  of required.
- `#19`'s `ParseRequest`/`ParseResult` contract changes: `institution`
  becomes optional on the request; the response needs a third outcome
  beyond "parsed" / "unrecognized" — "detected, but needs the user to
  confirm which account."
- Schema grows: `Institution` gets a content-detection signature;
  `Account` gets an identifying fragment (e.g. a masked account number)
  for disambiguating between multiple Accounts at the same Institution.
- A new Document-lifecycle nuance — "institution/account ambiguous, needs
  confirmation" — needs to fit deliberately into ADR-0011's state
  machine, most likely reusing the `NeedsReview` shape already
  established for Asset resolution, not a bolted-on state.
- **Not yet done**: this ADR records the direction, not a finished
  implementation. Per-institution signatures and label patterns are real,
  ongoing work — the spike already needed per-institution, and even
  per-report-period (yearly vs. quarterly), pattern differences and
  bug fixes. Extraction quality needs continued troubleshooting before
  this is production-ready; #14/#19/#21 rework and the new review-state
  UI are separate, tracked implementation work, not covered here.

## Related

- [0003 — Separate Python parsing service](0003-separate-python-parsing-service.md)
- [0007 — AI excluded from v1](0007-ai-excluded-from-v1.md)
- [0010 — Asset resolution requires manual confirmation](0010-asset-resolution-requires-manual-confirmation.md)
- [0011 — Document lifecycle](0011-document-lifecycle-separate-state-machine.md)
- [0013 — Shared ingestion front door](0013-shared-ingestion-front-door.md)
- [0014 — Per-(institution, format) parser registry](0014-parser-registry-generic-dispatch.md)
- `docs/private-docs/auto-institution-detection.md` — the pre-ADR design
  sketch this decision is based on
- `sandbox/` — the Phase 0 spike scripts and findings
- GitHub issues `#14`, `#19`, `#21` — implementation not yet updated to
  match this decision

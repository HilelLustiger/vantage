# 0025: Split "format" into Document type and Layout

## Status

Proposed — 2026-07-30

## Context

The parser-generalization design sketch (`docs/private-docs/
parser-generalization.md`) needs settled vocabulary before it becomes a real
ADR. Today's parser registry (ADR-0014) keys on `(institution, format)` — a
2-tuple where `format` quietly carries two independent things at once:

- **File encoding** — PDF vs CSV. ADR-0015 treats CSV as "just another
  `format` key" in the same registry.
- **Report shape** — which fields/tables are present and how they're
  arranged for a given Institution (e.g. a yearly Gemel report vs a
  quarterly one). This is the axis parser-generalization actually cares
  about: it's what drifts and what the new declarative `StatementTemplate`
  approach is meant to isolate.

ADR-0021 already generalizes "recognize what a Document is" into a
**Signature** concept, matched against multiple parameters. Institution was
the first parameter formalized there; this ADR names the other two.

## Decision

Split the overloaded `format` into two separate Signature parameters:

- **Document type** — the file encoding (PDF, CSV, ...).
- **Layout** — the report's field/table shape for a given Institution and
  Document type.

A Document's Signature is now matched against `(Institution, Document type,
Layout)` — a 3-tuple — instead of the old `(institution, format)` 2-tuple.

This ADR records the naming/shape decision only. `docs/DOMAIN.md` is updated
now (Signature rewritten, Document type and Layout added). The registry/
dispatch mechanics themselves — how ADR-0014's registry, `StatementTemplate`,
and the `(institution, format)` references across ADR-0014/0015/0021/0024
actually change — are deferred to the parser-generalization ADR.

## Alternatives Considered

- **Keep `format` as one overloaded dimension** — rejected: conflating file
  encoding with report shape makes Layout-level template reuse (the actual
  goal of parser-generalization — sharing a `StatementTemplate` shape across
  report periods) awkward to express, since a CSV export and a PDF of the
  same report period would need to be treated as unrelated "formats" instead
  of the same Layout in a different Document type.

## Consequences

- ADR-0014, 0015, 0021, 0024 still describe the old `(institution, format)`
  2-tuple in prose — updating that text is left to the parser-generalization
  ADR, which touches ADR-0014's registry shape directly anyway.
- Not yet implemented — no code changes; `apps/parser` still has one module
  per institution today.

## Related

- [0014 — Per-(institution, format) parser registry](0014-parser-registry-generic-dispatch.md)
- [0015 — PDF first; CSV support planned later, same registry](0015-pdf-first-csv-later.md)
- [0021 — Automatic institution/account detection](0021-automatic-institution-account-detection.md)
- [0024 — Ingesting per-transaction statement formats](0024-ingesting-per-transaction-statement-formats.md)
- `docs/private-docs/parser-generalization.md` — the design sketch this
  decision unblocks
- `docs/DOMAIN.md` — Signature, Document type, Layout

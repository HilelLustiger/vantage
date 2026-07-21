# 0007: AI deliberately excluded from v1

## Status

Accepted — 2026-07-21

## Context

AI could plausibly help with parts of this system — e.g. more flexible
document parsing, or smarter Asset matching — but this is a financial
"source of truth" application, where a silent misread is the worst possible
failure mode.

## Decision

AI is **deliberately excluded from v1**. Not a permanent rejection — revisit
once there's clear value.

## Alternatives Considered

- **AI-assisted parsing/matching** (e.g. an LLM interpreting statement
  layouts, or fuzzy-matching Assets) — rejected for v1: it would trade
  deterministic, testable behavior for probabilistic behavior on data where
  correctness matters most, add an external dependency, and complicate
  security review — all for a problem ([0014](0014-parser-registry-generic-dispatch.md)'s
  per-institution registry) that a deterministic approach already handles
  acceptably at this scale (one household, a handful of institutions).

## Consequences

- Unrecognized document formats fail loudly rather than being guessed at by
  a model (see [0014](0014-parser-registry-generic-dispatch.md)).
- Asset resolution requires manual human confirmation rather than
  AI-assisted fuzzy matching (see
  [0010](0010-asset-resolution-requires-manual-confirmation.md)).
- This should be revisited explicitly (not silently reversed) if a concrete,
  well-scoped use case emerges — e.g. once there's a proven track record of
  deterministic parsers and a clear gap AI would fill.

## Related

- [0014 — Per-(institution, format) parser registry](0014-parser-registry-generic-dispatch.md)
- [0010 — Asset resolution requires manual confirmation](0010-asset-resolution-requires-manual-confirmation.md)

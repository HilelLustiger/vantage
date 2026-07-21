# 0015: PDF first; CSV support planned later, same registry

## Status

Accepted — 2026-07-21

## Context

Statements are most reliably available as PDF downloads. Some institutions
may also offer CSV exports, but this is unconfirmed for the specific
institutions this household uses.

## Decision

**PDF first.** CSV support is planned for later, and fits into the same
per-(institution, format) registry
([0014](0014-parser-registry-generic-dispatch.md)) with no pipeline changes —
it's just another `format` key.

## Alternatives Considered

- **Build CSV support alongside PDF from the start** — rejected: whether CSV
  will actually be needed/used is unconfirmed for this household's specific
  institutions (see open questions), so building it now risks wasted effort
  on an unvalidated need.

## Consequences

- This is a low-cost deferral specifically because [0014](0014-parser-registry-generic-dispatch.md)
  already designed the registry to be format-agnostic — CSV isn't blocked on
  any architecture change, only on someone writing a CSV parser module when
  needed.

## Related

- [0014 — Per-(institution, format) parser registry](0014-parser-registry-generic-dispatch.md)
- Open question: whether CSV import will actually be needed — see the
  [ADR index](README.md#open-questions)

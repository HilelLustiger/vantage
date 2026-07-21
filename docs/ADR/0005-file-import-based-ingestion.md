# 0005: File-import-based ingestion, not live institution APIs

## Status

Accepted — 2026-07-21

## Context

Vantage needs to know the state of accounts held at external financial
institutions (brokerages, banks). Most of these institutions don't provide
public APIs a personal project could realistically integrate against.

## Decision

The system ingests **documents you download yourself** (PDF statements now,
other formats later — see [0015](0015-pdf-first-csv-later.md)) rather than
pursuing live integrations with institutions.

## Alternatives Considered

- **Live API integrations** (e.g. Plaid-style aggregation) — rejected: most
  relevant institutions don't expose public APIs, and third-party aggregators
  would mean routing financial data through an external service, conflicting
  with the project's privacy-first stance and single-household scope
  ([0004](0004-single-household-locally-hosted-scope.md)).

## Consequences

- History is only as fresh as the last document you import — there is no
  real-time balance view.
- The import pipeline is designed entirely around document parsing and
  human-in-the-loop confirmation (see
  [0010](0010-asset-resolution-requires-manual-confirmation.md)), not
  API polling or webhooks.
- Historical backfill is just "import an old document" — see
  [0016](0016-no-special-backfill-mode.md).

## Related

- [0003 — Separate Python parsing service](0003-separate-python-parsing-service.md)
- [0014 — Per-(institution, format) parser registry](0014-parser-registry-generic-dispatch.md)
- [0016 — No special backfill mode](0016-no-special-backfill-mode.md)

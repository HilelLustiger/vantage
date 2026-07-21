# 0010: Asset resolution requires manual confirmation, never auto-creates

## Status

Accepted — 2026-07-21

## Context

When a Document is parsed, each line needs to resolve to an Asset in the
global registry ([0008](0008-global-asset-registry.md)). Automatic matching
by ticker/ISIN handles the common case, but unmatched lines are ambiguous:
is this an existing Asset under a different name, or a genuinely new one? AI
is excluded from v1 ([0007](0007-ai-excluded-from-v1.md)), so there's no
fuzzy-matching fallback to lean on.

## Decision

The parser attempts automatic matching by ticker/ISIN. **Unmatched or new
Assets are not auto-created.** The Document is held in a `NeedsReview` state
until a human manually confirms each unmatched line as either "this is an
existing Asset under a different name" or "this is a genuinely new Asset."
This requires dedicated UI + backend logic.

A merge/cleanup tool for accidentally-duplicated Assets is explicitly
**deferred** to a future feature — not part of the initial build.

## Alternatives Considered

- **Auto-create new Assets on any unmatched line** — rejected: given the
  global registry's whole value is clean cross-account aggregation
  ([0008](0008-global-asset-registry.md)), silently creating a duplicate
  Asset (e.g. same company under a slightly different name/ticker) would
  quietly fragment that aggregation with no signal that it happened.
- **Fuzzy/heuristic auto-matching** — rejected for the same reason as
  [0007](0007-ai-excluded-from-v1.md): a wrong automatic match on financial
  data is worse than requiring one manual confirmation click.

## Consequences

- Every import of a previously-unseen Asset blocks on a human action; this is
  a deliberate speed/safety trade-off, acceptable given import volume is
  quarterly reports for a couple of accounts, not high-frequency data.
- The frontend needs a dedicated "Asset resolution" screen (tracked as an M1
  issue), not just a generic error/warning banner.
- Duplicate Assets can still happen from human error during confirmation;
  cleanup is out of scope until it's a proven need.

## Related

- [0007 — AI excluded from v1](0007-ai-excluded-from-v1.md)
- [0008 — Global Asset registry](0008-global-asset-registry.md)
- [0011 — Document lifecycle](0011-document-lifecycle-separate-state-machine.md)
- GitHub milestone **M1 — Frontend**, issue "Asset resolution UI"

# parser

Python parsing service. Minimal always-on HTTP service, zero exposed ports —
reachable only by `backend` over Docker's internal network (ADR-0001).

One linear pipeline, run identically for every document — no institution
lookup, no registry, no per-institution code path. The only variation across
institutions is how well the generic patterns/heuristics below happen to fit
a given layout, tuned over time against real samples. Split across two
endpoints so a human can approve what's about to be sent before stage 3 ever
runs:

**`POST /segment`** (stages 1+2 — file in, never calls the model):

1. **`segmentation.py`** — one generic, institution-agnostic deterministic
   pass over the whole document. Every line either matches one of the four
   locally-confirmed identity fields
   (`accountHolder`/`accountNumber`/`asOfDate`/`statementBalance` —
   `LocallyConfirmedFields`) via a generic label pattern, or it doesn't.
   `accountHolder`/`accountNumber` are genuine linking keys — excluded
   outright once labeled. `asOfDate`/`statementBalance` aren't — sent
   outright once labeled, since ADR-0008 already accepts de-identified
   financial figures as within the household's risk tolerance. Unlabeled
   lines fall to default-deny (ADR-0008's allowlist principle): included
   only if they positively look like a data row (two or more amount-shaped
   tokens) — the backstop for a linking key no label pattern catches yet, a
   missed inclusion is safe, a missed exclusion is a leak.
2. **`sensitivity.py`** — the sensitivity check: a fail-closed preflight
   (Israeli ID checksum scan + linking-key leak check) over the outbound
   buffer stage 1 built. Tripping it returns `privacy_preflight_aborted`
   directly — `/extract` is never called.

If the sensitivity check passes, `/segment` returns the candidate lines for
a human to review and approve/redact (`content_review` — this gate runs for
every document today; making it conditional later is a `backend`/UI change,
not a `parser` one).

**`POST /extract`** (stages 3+4 — the human-approved buffer in):

3. **`extraction.py`** — the model call: the approved buffer, and only the
   approved buffer, goes to Claude for holdings/transactions extraction
   (structured output).
4. **`formatting.py`** — the agreed format: merges the locally-captured
   identity values with the model's extraction, runs the one generic
   validity check (holdings total vs. the locally-captured
   `statementBalance`), attempts deterministic Asset matching
   (ticker/ISIN/securityNumber — ADR-0004, never AI), and builds the
   `committed`/`needs_review`/`failed` shape `backend/src/services/
parser.ts`'s `ParseDocumentResult` expects.

`main.py` wires the two endpoints to the 4 stages; `util.py` holds generic
helpers shared across them. The identity-label patterns and data-row
heuristic in `segmentation.py` have been checked against every real sample
under `sandbox/samples/` (two real leaks found and fixed this way — an
unlabeled joint-holder line and an unlabeled account-number line) but are
still a work in progress, not exhaustively validated — expect to keep tuning
them as new institutions/layouts are tried.

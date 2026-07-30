"""Per-(Institution, Document type, Layout) registry, ADR-0014 +
ADR-0025 — content-sniffing version. Replaces #23's caller-supplies-
institution lookup: the institution is detected from the file's own
text instead of trusted from the request (ADR-0021). document_type/
layout are ADR-0025's split of the old, overloaded "format" key — see
ADR-0026 for the DocumentTemplate architecture these will eventually
dispatch to (#52-#55), once each institution's hand-written extractor
is replaced. Adding an institution only touches this list, not the
service boundary (ADR-0003)."""

from typing import Any, Callable, TypedDict

from document_template import ValidityFailure
from excellence import extract_excellence_securities
from extraction_engine import extract as extract_via_engine
from gemel_template import gemel_template
from hapoalim import extract_hapoalim_securities
from hapoalim_transactions import extract_hapoalim_transactions
from pdfplumber.page import Page


class _Entry(TypedDict):
    institution: str
    document_type: str
    layout: str
    matches: Callable[[str, str], bool]
    # (text, page) — page is None only for callers (tests) that never reach
    # an entry needing it; every hand-written extractor here ignores it
    # (they only ever needed flattened text), only ADR-0026's
    # ExtractionEngine-backed entries (Gemel now; #53-#55 next) use it, for
    # the region-cropping/table extraction plain text can't support.
    extract: Callable[[str, "Page | None"], "dict[str, Any] | ValidityFailure"]


_ENTRIES: list[_Entry] = [
    {
        "institution": "מיטב גמל ופנסיה",
        "document_type": "pdf",
        # One DocumentTemplate handles both yearly and quarterly text
        # variants internally (fallback FieldSpec patterns), same shape
        # as gemel.py did — not split into two registry entries. "balance"
        # reflects that; see #52's closing notes for why.
        "layout": "balance",
        "matches": lambda text, raw_text: "מיטב" in text[:400],
        "extract": lambda text, page: extract_via_engine(page, gemel_template("מיטב גמל ופנסיה")),
    },
    {
        "institution": "הראל",
        "document_type": "pdf",
        "layout": "balance",
        "matches": lambda text, raw_text: "הראל" in text[:400],
        "extract": lambda text, page: extract_via_engine(page, gemel_template("הראל")),
    },
    {
        "institution": "Bank Hapoalim",
        "document_type": "pdf",
        "layout": "balance",
        # ASCII URL, unaffected by RTL — checked against the pre-bidi-fix
        # raw text, not the display-corrected text used everywhere else.
        "matches": lambda text, raw_text: "bankhapoalim" in raw_text[:200],
        "extract": lambda text, page: extract_hapoalim_securities(text),
    },
    {
        # Same institution, a second recognized document shape — the
        # account-transactions export (ADR-0024), from a different bank
        # portal page than the balance report above. Verified against real
        # samples: this URL fragment appears only in the transactions
        # export's page-footer text, never in the balance report's, and the
        # balance report's own "bankhapoalim" match above never appears in
        # this export within its [:200] window — the two signatures are
        # confirmed disjoint, see test_registry.py.
        "institution": "Bank Hapoalim",
        "document_type": "pdf",
        "layout": "transactions",
        "matches": lambda text, raw_text: "current-account/transactions" in raw_text,
        "extract": lambda text, page: extract_hapoalim_transactions(text),
    },
    {
        "institution": "אקסלנס",
        "document_type": "pdf",
        "layout": "balance",
        "matches": lambda text, raw_text: "אקסלנס" in text or "xnes.co.il" in raw_text,
        "extract": lambda text, page: extract_excellence_securities(text),
    },
]


def detect_and_extract(
    text: str, raw_text: str, page: "Page | None" = None
) -> "dict[str, Any] | ValidityFailure | None":
    """text: bidi-fixed page text. raw_text: pdfplumber's unfixed output —
    needed for ASCII/URL signatures where bidi-fixing is a no-op anyway but
    keeping the distinction explicit avoids relying on that coincidence.
    page: the live pdfplumber Page — only ExtractionEngine-backed entries
    (Gemel; #53-#55 next) need it, for region-cropping/table extraction
    plain text can't support. Optional/defaults to None only so tests that
    never reach one of those entries don't need to fabricate a real page.

    Unrecognized (Institution, Document type, Layout) combinations return
    None — fail loudly, never a generic/heuristic fallback (ADR-0014)."""
    for entry in _ENTRIES:
        if entry["matches"](text, raw_text):
            return entry["extract"](text, page)
    return None

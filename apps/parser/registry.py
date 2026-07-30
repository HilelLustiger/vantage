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
from gemel import extract_gemel_statement
from hapoalim import extract_hapoalim_securities
from hapoalim_transactions import extract_hapoalim_transactions


class _Entry(TypedDict):
    institution: str
    document_type: str
    layout: str
    matches: Callable[[str, str], bool]
    # dict | ValidityFailure widens ahead of any entry actually producing
    # the latter — no hand-written extractor here does (ADR-0026's
    # DocumentTemplate/ExtractionEngine can; #52-#55 are what replace these
    # entries with one once each institution's real template exists).
    extract: Callable[[str], "dict[str, Any] | ValidityFailure"]


_ENTRIES: list[_Entry] = [
    {
        "institution": "מיטב גמל ופנסיה",
        "document_type": "pdf",
        # Today's extractor handles yearly and quarterly text variants
        # internally (fallback patterns), not as separate registry
        # entries — "balance" reflects that this registry entry doesn't
        # yet split by period. #52 may split this further once Gemel's
        # real DocumentTemplate work happens (ADR-0025's own definition
        # of Layout uses yearly-vs-quarterly-Gemel as its example).
        "layout": "balance",
        "matches": lambda text, raw_text: "מיטב" in text[:400],
        "extract": lambda text: extract_gemel_statement(text, "מיטב גמל ופנסיה"),
    },
    {
        "institution": "הראל",
        "document_type": "pdf",
        "layout": "balance",
        "matches": lambda text, raw_text: "הראל" in text[:400],
        "extract": lambda text: extract_gemel_statement(text, "הראל"),
    },
    {
        "institution": "Bank Hapoalim",
        "document_type": "pdf",
        "layout": "balance",
        # ASCII URL, unaffected by RTL — checked against the pre-bidi-fix
        # raw text, not the display-corrected text used everywhere else.
        "matches": lambda text, raw_text: "bankhapoalim" in raw_text[:200],
        "extract": extract_hapoalim_securities,
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
        "extract": extract_hapoalim_transactions,
    },
    {
        "institution": "אקסלנס",
        "document_type": "pdf",
        "layout": "balance",
        "matches": lambda text, raw_text: "אקסלנס" in text or "xnes.co.il" in raw_text,
        "extract": extract_excellence_securities,
    },
]


def detect_and_extract(text: str, raw_text: str) -> "dict[str, Any] | ValidityFailure | None":
    """text: bidi-fixed page text. raw_text: pdfplumber's unfixed output —
    needed for ASCII/URL signatures where bidi-fixing is a no-op anyway but
    keeping the distinction explicit avoids relying on that coincidence.

    Unrecognized (Institution, Document type, Layout) combinations return
    None — fail loudly, never a generic/heuristic fallback (ADR-0014)."""
    for entry in _ENTRIES:
        if entry["matches"](text, raw_text):
            return entry["extract"](text)
    return None

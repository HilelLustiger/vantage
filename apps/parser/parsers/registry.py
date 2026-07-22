"""Per-(institution, format) registry, ADR-0014 — content-sniffing version.
Replaces #23's caller-supplies-institution lookup: the institution is
detected from the file's own text instead of trusted from the request
(ADR-0021). Adding an institution only touches this list, not the service
boundary (ADR-0003)."""

from typing import Any, Callable, TypedDict

from .excellence import extract_excellence_securities
from .gemel import extract_gemel_statement
from .hapoalim import extract_hapoalim_securities


class _Entry(TypedDict):
    institution: str
    format: str
    matches: Callable[[str, str], bool]
    extract: Callable[[str], dict[str, Any]]


_ENTRIES: list[_Entry] = [
    {
        "institution": "מיטב גמל ופנסיה",
        "format": "pdf",
        "matches": lambda text, raw_text: "מיטב" in text[:400],
        "extract": lambda text: extract_gemel_statement(text, "מיטב גמל ופנסיה"),
    },
    {
        "institution": "הראל",
        "format": "pdf",
        "matches": lambda text, raw_text: "הראל" in text[:400],
        "extract": lambda text: extract_gemel_statement(text, "הראל"),
    },
    {
        "institution": "Bank Hapoalim",
        "format": "pdf",
        # ASCII URL, unaffected by RTL — checked against the pre-bidi-fix
        # raw text, not the display-corrected text used everywhere else.
        "matches": lambda text, raw_text: "bankhapoalim" in raw_text[:200],
        "extract": extract_hapoalim_securities,
    },
    {
        "institution": "אקסלנס",
        "format": "pdf",
        "matches": lambda text, raw_text: "אקסלנס" in text or "xnes.co.il" in raw_text,
        "extract": extract_excellence_securities,
    },
]


def detect_and_extract(text: str, raw_text: str) -> dict[str, Any] | None:
    """text: bidi-fixed page text. raw_text: pdfplumber's unfixed output —
    needed for ASCII/URL signatures where bidi-fixing is a no-op anyway but
    keeping the distinction explicit avoids relying on that coincidence."""
    for entry in _ENTRIES:
        if entry["matches"](text, raw_text):
            return entry["extract"](text)
    return None

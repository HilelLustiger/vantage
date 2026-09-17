"""Generic, institution-agnostic helpers shared across the pipeline stages."""

import re

from bidi.algorithm import get_display


def fix_rtl(text: str | None) -> str:
    """pdfplumber extracts Hebrew/Arabic in visual (glyph-position) order,
    not logical reading order — apply the Unicode bidi algorithm per line to
    fix it. Confirmed against real statements: 'מ"עב היסנפו למג בטימ'
    (garbled) -> 'מיטב גמל ופנסיה בע"מ' (correct). Lines with no RTL content
    pass through unchanged."""
    if not text:
        return ""
    return "\n".join(get_display(line) for line in text.split("\n"))


def find(lines: list[str], pattern: str, flags: int = 0) -> re.Match | None:
    for line in lines:
        m = re.search(pattern, line, flags)
        if m:
            return m
    return None


def parse_amount(s: str | None) -> float | None:
    """'6,882-' or '-6,882' or '6,882' -> -6882.0 / -6882.0 / 6882.0. Handles
    the trailing-minus bidi artifact seen on negative figures throughout
    these documents (a leading minus can also relocate to the end in RTL
    context)."""
    if s is None:
        return None
    s = s.strip()
    negative = s.startswith("-") or s.endswith("-")
    s = s.strip("-").replace(",", "")
    value = float(s)
    return -value if negative else value


def parse_pct(s: str | None) -> float | None:
    if s is None:
        return None
    return parse_amount(s.replace("%", ""))


def normalize_2digit_year(date: str) -> str:
    """'17/09/24' -> '17/09/2024' — assumes 20xx, matching every real sample
    and this app's realistic usage range."""
    day, month, year = date.split("/")
    return f"{day}/{month}/20{year}"

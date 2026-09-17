"""Stage 1 — segmentation: one generic, institution-agnostic deterministic
pass over the whole document, line by line, in page order. No per-
institution lookup, no registry — the exact same patterns/heuristics run on
every document regardless of which institution it's from.

Every line either matches one of the four locally-confirmed identity fields
(LocallyConfirmedFields in backend/src/dto/documents.ts) via a generic label
pattern, or it doesn't. Three different outcomes follow:

- **A genuine linking key** (accountHolder/accountNumber — a name or account
  number, which could tie the document to a person): `redacted=True`, its
  text never leaves this function at all (not even to the rest of this
  process) — a human can see that a line was removed here, never what it
  said. Its position is kept regardless (see Bbox below) — where something
  was removed isn't sensitive, only what it said.
- **Non-linking** (asOfDate/statementBalance — a bare date or balance figure
  can't identify anyone; ADR-0008 already accepts de-identified financial
  figures as within the household's risk tolerance): included outright,
  never subject to the shape check below.
- **Not labeled at all**: `flagged` unless it positively matches the data-
  row shape (two or more amount-shaped tokens — the shape of a holdings/
  transaction table row). Unlike an earlier design here, an unrecognized
  line is never silently dropped — it's shown to the human, flagged, and
  excluded by default unless they deliberately include it (sensitivity.py
  adds further flags for the same underlying reason — a checksum-valid ID
  or a leaked linking-key value — on top of whatever this stage already
  decided)."""

from __future__ import annotations

import re
from dataclasses import dataclass

from pdfplumber.page import Page

from util import fix_rtl

# Generic label synonyms (Hebrew + English), tried against every document —
# not tied to any institution. Labels genuinely vary by wording; these are
# a starting set to refine against real samples, same spirit as the
# generic data-row heuristic below.
_IDENTITY_PATTERNS: dict[str, list[str]] = {
    "accountHolder": [
        r"(?:שם העמית|שם הלקוח|שם)\s*:\s*(.+)",
        r"(?:account holder|customer name|name)\s*:\s*(.+)",
        # Two names with no label at all — a joint account's holder line
        # (e.g. "Jane Doe ו-John Smith 123 456 789"), confirmed against a
        # real Bank Hapoalim sample: unlabeled, so the labeled patterns
        # above never catch it, and the line has 3+ digit runs so it would
        # otherwise pass the data-row heuristic below undetected.
        r"^([^\d\n]*\sו[^\d\n]*)\s+\d+\s+\d+\s+\d+$",
    ],
    "accountNumber": [
        r"(?:מספר חשבון|מס['׳]\s*חשבון)\s*:?\s*([\d-]+)",
        r"account\s*(?:number|no\.?)\s*:?\s*([\d-]+)",
        # "מס' : 1234-5" — no "חשבון" word at all, confirmed against a real
        # Bank Hapoalim transactions-export sample.
        r"מס['׳]\s*:\s*([\d-]+)",
    ],
    "asOfDate": [
        r"(?:תאריך הדוח|נכון לתאריך|נתונים ליום)\s*:?\s*([\d./]+)",
        r"as of\s*:?\s*([\d./]+)",
    ],
    "statementBalance": [
        r"(?:יתרת הכספים בחשבון|יתרת נכסים)[^\d\n]{0,20}(\d[\d,]*(?:\.\d+)?)",
        r"(?:total|closing) balance\s*:?\s*([\d,]+(?:\.\d+)?)",
    ],
}

# accountHolder/accountNumber are genuine linking keys — a name or account
# number has no structural signature that distinguishes it from any other
# text/number (unlike an Israeli ID, which has a checksum sensitivity.py
# checks directly), so a labeled match is redacted outright, regardless of
# line shape. asOfDate/statementBalance aren't linking keys — a bare date or
# balance figure can't tie the document to a person — so once positively
# identified as one of those, the line is included outright too.
_SENSITIVE_FIELDS = frozenset({"accountHolder", "accountNumber"})

# A financial figure: digits with optional thousands-commas and a decimal,
# optionally a trailing/leading minus (the bidi artifact util.parse_amount
# was written for).
_AMOUNT_RE = re.compile(r"-?\d[\d,]*(?:\.\d+)?-?")

# Generic financial-concept vocabulary (Hebrew + English) — not an identity
# field (no LocallyConfirmedFields slot, no value captured, just a
# classification): a broader class of "labeled financial figure" line safe
# to include outright, same non-linking reasoning as asOfDate/
# statementBalance above (a fee, transfer, or return figure can't identify
# anyone) — for labels statementBalance's own narrower patterns don't cover.
# Confirmed missing against a real Harel yearly report ("כספים שהעברת
# לחשבון 154,718" has no "יתרת הכספים בחשבון" phrase, so fell through to
# flagged even though it's exactly as safe). The vocabulary will keep
# needing entries as more real samples are tried; the point is the
# category (a labeled, single, non-identity figure), not enumerating every
# institution's exact phrase.
_SAFE_FINANCIAL_LABEL_RE = re.compile(
    r"(כספים|דמי ניהול|יתרת|רווח(?:ים)?|הפסד(?:ים)?|תשוא[הת]|עמלה|עמלות|"
    r"משיכה|הפקדה|הפקדות|העברה|תגמולים|סכום|"
    r"deposit|withdrawal|fee|return|transfer)"
    r"[^\n\d]*(-?[\d,]+(?:\.\d+)?%?-?)\s*$",
    re.IGNORECASE,
)

_DATE_RE = re.compile(r"^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$")

UNRECOGNIZED_SHAPE_REASON = "לא זוהה כשורת נתונים ברורה"


def _is_safe_financial_figure(line: str) -> bool:
    return bool(_SAFE_FINANCIAL_LABEL_RE.search(line))


def _normalize_date(value: str) -> str:
    """DD/MM/YYYY or DD.MM.YYYY (day-month order — every real sample so far
    is Israeli-institution formatted; 2-digit years assumed 20xx, same
    convention as util.normalize_2digit_year) -> ISO YYYY-MM-DD, the shape
    Postgres's `date` column actually expects (confirmed against a real
    Harel sample: storing "31/03/2026" as-is raised "date/time field value
    out of range"). Returns the raw value unchanged if it doesn't match —
    safer than raising here, since main.py still stores whatever comes
    back and a human sees it in the review screen either way."""
    m = _DATE_RE.match(value.strip())
    if not m:
        return value
    day, month, year = m.groups()
    if len(year) == 2:
        year = f"20{year}"
    return f"{year}-{int(month):02d}-{int(day):02d}"


@dataclass
class Bbox:
    """Already normalized against the page's own mediabox origin (see
    _fixed_lines) — (0, 0) is always this page's own top-left corner,
    regardless of what the source PDF's mediabox itself declares. Confirmed
    necessary against a real Excellence sample: its mediabox starts at
    (0, 822.05) instead of (0, 0), so pdfplumber's raw top/bottom/x0/x1 read
    as wildly out-of-bounds until this offset is subtracted — verified by
    rendering the page and drawing rects at both the raw and the
    offset-corrected coordinates; only the corrected ones land on the
    actual text."""

    x0: float
    top: float
    x1: float
    bottom: float


@dataclass
class SegmentedLine:
    index: int
    redacted: bool
    text: str | None  # None only when redacted
    bbox: Bbox
    flagged: bool = False
    flag_reason: str | None = None


@dataclass
class Segmentation:
    identity_values: dict[str, str | None]
    lines: list[SegmentedLine]
    page_width: float
    page_height: float


def _fixed_lines(page: Page) -> list[dict]:
    x0_offset, top_offset = page.bbox[0], page.bbox[1]
    lines = []
    for line in page.extract_text_lines():
        lines.append(
            {
                "text": fix_rtl(line["text"]),
                "bbox": Bbox(
                    x0=line["x0"] - x0_offset,
                    top=line["top"] - top_offset,
                    x1=line["x1"] - x0_offset,
                    bottom=line["bottom"] - top_offset,
                ),
            }
        )
    return lines


def _match_identity(line: str) -> tuple[str, str] | None:
    for name, patterns in _IDENTITY_PATTERNS.items():
        for pattern in patterns:
            m = re.search(pattern, line, re.IGNORECASE)
            if m:
                return name, m.group(1).strip()
    return None


def _looks_like_data_row(line: str) -> bool:
    """Two or more amount-shaped tokens — the shape of a holdings/
    transaction table row (name + quantity + value, or date + amount +
    balance), not a single labeled figure the way an identity/summary line
    reads."""
    return len(_AMOUNT_RE.findall(line)) >= 2


def segment(page: Page) -> Segmentation:
    identity_values: dict[str, str | None] = dict.fromkeys(_IDENTITY_PATTERNS)
    lines: list[SegmentedLine] = []

    for i, line in enumerate(_fixed_lines(page)):
        text, bbox = line["text"], line["bbox"]
        identity_match = _match_identity(text)
        if identity_match:
            name, value = identity_match
            if name == "asOfDate":
                value = _normalize_date(value)
            if identity_values[name] is None:
                identity_values[name] = value
            if name in _SENSITIVE_FIELDS:
                lines.append(
                    SegmentedLine(index=i, redacted=True, text=None, bbox=bbox)
                )
            else:
                lines.append(
                    SegmentedLine(index=i, redacted=False, text=text, bbox=bbox)
                )
            continue

        if _is_safe_financial_figure(text):
            lines.append(SegmentedLine(index=i, redacted=False, text=text, bbox=bbox))
            continue

        if _looks_like_data_row(text):
            lines.append(SegmentedLine(index=i, redacted=False, text=text, bbox=bbox))
        else:
            lines.append(
                SegmentedLine(
                    index=i,
                    redacted=False,
                    text=text,
                    bbox=bbox,
                    flagged=True,
                    flag_reason=UNRECOGNIZED_SHAPE_REASON,
                )
            )

    return Segmentation(
        identity_values=identity_values,
        lines=lines,
        page_width=page.width,
        page_height=page.height,
    )

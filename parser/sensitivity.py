"""Stage 2 — the sensitivity check: a per-line safety scan on top of
segmentation's own classification, defense in depth over it (ADR-0008). Can
only ever add a flag to a line segmentation already marked safe — never
remove one segmentation already set, and never touch a redacted line's
content (there isn't any to scan)."""

import re
from dataclasses import replace

from segmentation import Segmentation, SegmentedLine

_ISRAELI_ID_RE = re.compile(r"\b\d{9}\b")

# Only these two are genuine linking keys — a repeated asOfDate/
# statementBalance elsewhere on the page isn't a leak (a statement date or a
# round balance figure legitimately appears more than once); only a name or
# account number can tie the document to a person.
_LEAK_CHECKED_FIELDS = ("accountHolder", "accountNumber")


def _passes_israeli_id_checksum(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(digits):
        weighted = int(ch) * (1 if i % 2 == 0 else 2)
        total += weighted if weighted < 10 else weighted - 9
    return total % 10 == 0


def _line_risk(text: str, identity_values: dict[str, str | None]) -> str | None:
    for match in _ISRAELI_ID_RE.finditer(text):
        if _passes_israeli_id_checksum(match.group()):
            return "נמצא בשורה מספר שעובר בדיקת תקינות של ת.ז."
    for field in _LEAK_CHECKED_FIELDS:
        value = identity_values.get(field)
        if value and value in text:
            return "השורה תואמת מידע שכבר זוהה כמזהה"
    return None


def classify(segmentation: Segmentation) -> list[SegmentedLine]:
    result: list[SegmentedLine] = []
    for line in segmentation.lines:
        if line.redacted or line.flagged or line.text is None:
            result.append(line)
            continue
        reason = _line_risk(line.text, segmentation.identity_values)
        result.append(
            replace(line, flagged=True, flag_reason=reason) if reason else line
        )
    return result

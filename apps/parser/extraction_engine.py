"""Generic extraction engine — ADR-0026. Interprets a DocumentTemplate
against a real pdfplumber page; every institution's template runs
through this same code path instead of a hand-rolled parser module."""

import re
from typing import Any

from pdfplumber.page import Page

from common import find, fix_rtl
from document_template import (
    ColumnSpec,
    DocumentTemplate,
    FieldSpec,
    SectionSpec,
    TableSpec,
    ValidityFailure,
    ValidityResult,
)

# Default (line-based) table detection finds nothing on these PDFs — they're
# borderless, whitespace-delimited layouts (confirmed against real samples).
_TABLE_SETTINGS = {"vertical_strategy": "text", "horizontal_strategy": "text"}


def extract(page: Page, template: DocumentTemplate) -> dict[str, Any] | ValidityFailure:
    lines = _fixed_lines(page)
    line_texts = [line["text"] for line in lines]
    section_crops = _resolve_sections(page, template.sections, lines)

    values: dict[str, Any] = {}
    missing: list[ValidityResult] = []

    for field_spec in template.fields:
        value, found = _evaluate_field(line_texts, field_spec)
        values[field_spec.name] = value
        if not found and field_spec.required:
            missing.append(
                ValidityResult(name=field_spec.name, computed=None, claimed=None, matched=False)
            )

    for table_spec in template.tables:
        rows, found = _evaluate_table(section_crops, table_spec)
        values[table_spec.name] = rows
        if not found and table_spec.required:
            missing.append(
                ValidityResult(name=table_spec.name, computed=None, claimed=None, matched=False)
            )

    # The completeness gate: reconcile never runs on incomplete data — a
    # required field/table missing means nothing downstream can trust this
    # extraction, whatever reconcile's own math might otherwise conclude.
    if missing:
        return ValidityFailure(values=values, failed_checks=missing)

    if template.reconcile is None:
        return values
    return template.reconcile(values)


def _fixed_lines(page: Page) -> list[dict[str, Any]]:
    """extract_text_lines(), with fix_rtl() applied to each line's text.
    Keeps top/bottom so a matched line's position can be used to crop —
    matching against raw (pre-bidi) text would be unreadable to write
    patterns against, so this is the same text FieldSpec patterns see."""
    text_lines = page.extract_text_lines()
    for line in text_lines:
        line["text"] = fix_rtl(line["text"])
    return text_lines


def _find_line(lines: list[dict[str, Any]], pattern: str) -> dict[str, Any] | None:
    for line in lines:
        if re.search(pattern, line["text"]):
            return line
    return None


def _resolve_sections(
    page: Page, sections: list[SectionSpec], lines: list[dict[str, Any]]
) -> dict[str, Page | None]:
    """Each section's region runs from its own start_marker's line to the
    next section's start_marker's line (in declaration order), or to the
    page bottom for the last one. A marker not found on this page resolves
    to None — any TableSpec referencing it treats that as "this table
    wasn't found", its own required/optional handling applies from there."""
    starts: list[float | None] = []
    for section in sections:
        line = _find_line(lines, section.start_marker)
        starts.append(line["top"] if line else None)

    # The real bottom of the last section's region — not page.height, which
    # some real statements' own declared page.bbox doesn't actually reach
    # (confirmed on Excellence's samples: a mediabox/content mismatch in the
    # source PDF puts every line's top/bottom outside page.bbox entirely).
    # The bottom-most extracted line is accurate regardless of that mismatch.
    page_bottom = max((line["bottom"] for line in lines), default=page.height)

    crops: dict[str, Page | None] = {}
    for i, section in enumerate(sections):
        start = starts[i]
        if start is None:
            crops[section.name] = None
            continue
        end = page_bottom
        for later_start in starts[i + 1 :]:
            if later_start is not None:
                end = later_start
                break
        if end <= start:
            raise ValueError(
                f"SectionSpec {section.name!r} resolved to an empty/negative "
                f"region (start={start}, end={end}) — sections must be "
                "declared in the same top-to-bottom order they appear on the page."
            )
        # strict=False: some real statements (confirmed on Excellence's
        # samples) have a page.bbox that doesn't actually cover where their
        # own text sits — a mediabox/content mismatch in the source PDF, not
        # our bug. line["top"] positions are still accurate for cropping;
        # strict mode would reject a geometrically-correct crop just because
        # it falls outside the page's own (wrong) declared bbox.
        crops[section.name] = page.within_bbox((0, start, page.width, end), strict=False)
    return crops


def _evaluate_field(lines: list[str], spec: FieldSpec) -> tuple[Any, bool]:
    for pattern in spec.patterns:
        match = find(lines, pattern)
        if match:
            return spec.parser(match.group(1)), True
    return spec.default, False


def _evaluate_table(
    section_crops: dict[str, Page | None], spec: TableSpec
) -> tuple[list[dict[str, Any]], bool]:
    crop = section_crops.get(spec.section)
    if crop is None:
        return [], False

    rows = _table_rows(crop)
    header = _find_header(rows, spec.columns)
    if header is None:
        return [], False

    header_index, mapping = header
    data_rows = _data_rows(rows, header_index)
    return (
        [
            {column.name: column.parser(row[cell_index]) for cell_index, column in mapping.items()}
            for row in data_rows
        ],
        True,
    )


def _table_rows(crop: Page) -> list[list[str]]:
    rows: list[list[str]] = []
    for table in crop.extract_tables(_TABLE_SETTINGS):
        rows.extend(table)
    return [[fix_rtl(cell) if cell else "" for cell in row] for row in rows]


def _matches(cell: str, patterns: list[str]) -> bool:
    return any(re.search(pattern, cell) for pattern in patterns)


def _find_header(
    rows: list[list[str]], columns: list[ColumnSpec]
) -> tuple[int, dict[int, ColumnSpec]] | None:
    """Finds the first row where every column's header_patterns matches a
    distinct cell — the resulting {cell_index: ColumnSpec} mapping is what
    every subsequent data row gets read against."""
    for row_index, row in enumerate(rows):
        mapping: dict[int, ColumnSpec] = {}
        for column in columns:
            cell_index = next(
                (
                    i
                    for i, cell in enumerate(row)
                    if i not in mapping and _matches(cell, column.header_patterns)
                ),
                None,
            )
            if cell_index is None:
                break
            mapping[cell_index] = column
        else:
            return row_index, mapping
    return None


def _data_rows(rows: list[list[str]], header_index: int) -> list[list[str]]:
    """Rows immediately after the header, trimmed at the first row whose
    cell count doesn't match — the same rule for every table, not
    institution-specific knowledge, which is why it lives here rather than
    as a per-template locate() callable."""
    width = len(rows[header_index])
    data_rows: list[list[str]] = []
    for row in rows[header_index + 1 :]:
        if len(row) != width:
            break
        data_rows.append(row)
    return data_rows

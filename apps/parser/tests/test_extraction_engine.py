"""Unit tests for ExtractionEngine against synthetic pages (see
conftest.py's build_page) — independent of any real institution's
template, per ADR-0026: the engine is meant to be testable on its own,
separate from testing any one institution's actual template."""

import pytest

from document_template import (
    ColumnSpec,
    DocumentTemplate,
    FieldSpec,
    SectionSpec,
    TableSpec,
    ValidityFailure,
    ValidityResult,
)
from extraction_engine import extract


def test_field_first_matching_pattern_wins(build_page) -> None:
    page = build_page(["Total: 999", "Amount: 100"])
    template = DocumentTemplate(
        institution="t",
        document_type="pdf",
        layout="t",
        fields=[FieldSpec("value", [r"Total:\s*(\d+)", r"Amount:\s*(\d+)"], parser=int)],
    )
    assert extract(page, template) == {"value": 999}


def test_field_falls_back_to_second_pattern(build_page) -> None:
    page = build_page(["Amount: 100"])
    template = DocumentTemplate(
        institution="t",
        document_type="pdf",
        layout="t",
        fields=[FieldSpec("value", [r"Total:\s*(\d+)", r"Amount:\s*(\d+)"], parser=int)],
    )
    assert extract(page, template) == {"value": 100}


def test_missing_optional_field_uses_default(build_page) -> None:
    page = build_page(["Nothing relevant here"])
    template = DocumentTemplate(
        institution="t",
        document_type="pdf",
        layout="t",
        fields=[FieldSpec("value", [r"NoMatch"], required=False, default="fallback")],
    )
    assert extract(page, template) == {"value": "fallback"}


def test_missing_required_field_produces_validity_failure(build_page) -> None:
    page = build_page(["Nothing relevant here"])
    template = DocumentTemplate(
        institution="t",
        document_type="pdf",
        layout="t",
        fields=[FieldSpec("value", [r"NoMatch"], required=True)],
    )
    result = extract(page, template)
    assert isinstance(result, ValidityFailure)
    assert result.values == {"value": None}
    assert result.failed_checks == [ValidityResult("value", None, None, False)]


def test_table_with_missing_section_and_optional_is_empty(build_page) -> None:
    page = build_page(["Nothing relevant here"])
    template = DocumentTemplate(
        institution="t",
        document_type="pdf",
        layout="t",
        sections=[SectionSpec("missing", r"Never appears")],
        tables=[
            TableSpec(
                "holdings", section="missing", columns=[ColumnSpec("c", [r"^C$"])], required=False
            )
        ],
    )
    assert extract(page, template) == {"holdings": []}


def test_table_with_missing_section_and_required_produces_validity_failure(build_page) -> None:
    page = build_page(["Nothing relevant here"])
    template = DocumentTemplate(
        institution="t",
        document_type="pdf",
        layout="t",
        sections=[SectionSpec("missing", r"Never appears")],
        tables=[
            TableSpec(
                "holdings", section="missing", columns=[ColumnSpec("c", [r"^C$"])], required=True
            )
        ],
    )
    result = extract(page, template)
    assert isinstance(result, ValidityFailure)
    assert result.failed_checks == [ValidityResult("holdings", None, None, False)]


def test_sections_declared_out_of_page_order_raises(build_page) -> None:
    # "Section B" physically appears above "Section A" on the page, but
    # the template declares A before B — a template-authoring bug, not
    # data variability, so this must fail loudly rather than silently
    # crop something nonsensical.
    page = build_page(["Section B", "Section A"])
    template = DocumentTemplate(
        institution="t",
        document_type="pdf",
        layout="t",
        sections=[SectionSpec("a", r"Section A"), SectionSpec("b", r"Section B")],
        tables=[TableSpec("t", section="a", columns=[ColumnSpec("c", [r"^C$"])])],
    )
    with pytest.raises(ValueError, match="empty/negative"):
        extract(page, template)


def test_table_header_detection_and_column_mapping(build_page) -> None:
    page = build_page(
        [
            "Section A: Holdings",
            ("Name", "Qty", "Price"),
            ("AAPL", "10", "150.00"),
            ("MSFT", "5", "300.00"),
            "Section B: Footer",
        ]
    )
    template = DocumentTemplate(
        institution="t",
        document_type="pdf",
        layout="t",
        sections=[
            SectionSpec("holdings", r"Section A: Holdings"),
            SectionSpec("footer", r"Section B: Footer"),
        ],
        tables=[
            TableSpec(
                "holdings",
                section="holdings",
                columns=[
                    ColumnSpec("name", [r"^Name$"]),
                    ColumnSpec("qty", [r"^Qty$"]),
                    ColumnSpec("price", [r"^Price$"]),
                ],
            )
        ],
    )
    result = extract(page, template)
    assert result == {
        "holdings": [
            {"name": "AAPL", "qty": "10", "price": "150.00"},
            {"name": "MSFT", "qty": "5", "price": "300.00"},
        ]
    }


def test_table_row_trimming_stops_at_width_change(build_page) -> None:
    # "Total: 15" is deliberately drawn at a column offset (400) the table's
    # own columns (50/150/250) never use — text-strategy table detection
    # doesn't fold it into the table's inferred column grid at all in that
    # case (confirmed empirically), so it's absent from the raw extracted
    # rows entirely, and trimming stops right after the real data.
    page = build_page(
        [
            "Section A: Holdings",
            ("Name", "Qty", "Price"),
            ("AAPL", "10", "150.00"),
            ("MSFT", "5", "300.00"),
            ("", "", "", "Total: 15"),
            "Section B: Footer",
        ]
    )
    template = DocumentTemplate(
        institution="t",
        document_type="pdf",
        layout="t",
        sections=[
            SectionSpec("holdings", r"Section A: Holdings"),
            SectionSpec("footer", r"Section B: Footer"),
        ],
        tables=[
            TableSpec(
                "holdings",
                section="holdings",
                columns=[
                    ColumnSpec("name", [r"^Name$"]),
                    ColumnSpec("qty", [r"^Qty$"]),
                    ColumnSpec("price", [r"^Price$"]),
                ],
            )
        ],
    )
    result = extract(page, template)
    names = [row["name"] for row in result["holdings"]]
    assert names == ["AAPL", "MSFT"]


def test_reconcile_never_called_when_required_field_missing(build_page) -> None:
    page = build_page(["Nothing relevant here"])
    calls = []
    template = DocumentTemplate(
        institution="t",
        document_type="pdf",
        layout="t",
        fields=[FieldSpec("value", [r"NoMatch"], required=True)],
        reconcile=lambda values: (calls.append(values), values)[1],
    )
    result = extract(page, template)
    assert isinstance(result, ValidityFailure)
    assert calls == []


def test_reconcile_runs_on_complete_data_and_can_extend_values(build_page) -> None:
    page = build_page(["Value: 100"])

    def reconcile(values: dict) -> dict:
        return {**values, "doubled": values["value"] * 2}

    template = DocumentTemplate(
        institution="t",
        document_type="pdf",
        layout="t",
        fields=[FieldSpec("value", [r"Value:\s*(\d+)"], parser=int)],
        reconcile=reconcile,
    )
    assert extract(page, template) == {"value": 100, "doubled": 200}


def test_reconcile_failure_propagates(build_page) -> None:
    page = build_page(["Value: 100"])

    def reconcile(values: dict) -> ValidityFailure:
        return ValidityFailure(
            values=values, failed_checks=[ValidityResult("x", 1.0, 2.0, False)]
        )

    template = DocumentTemplate(
        institution="t",
        document_type="pdf",
        layout="t",
        fields=[FieldSpec("value", [r"Value:\s*(\d+)"], parser=int)],
        reconcile=reconcile,
    )
    result = extract(page, template)
    assert isinstance(result, ValidityFailure)
    assert result.failed_checks[0].name == "x"

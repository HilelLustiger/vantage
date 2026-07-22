from bidi.algorithm import get_display

from parsers.common import fix_rtl, parse_amount, parse_pct


def test_fix_rtl_reorders_visual_order_to_logical_order() -> None:
    # pdfplumber's raw extraction order for RTL text ("visual" order) —
    # get_display's own inverse of a known logical string, same relationship
    # confirmed against a real statement during the Phase 0 spike.
    logical = "שלום עולם"
    visual = get_display(logical)
    assert fix_rtl(visual) == logical


def test_fix_rtl_handles_empty_and_none() -> None:
    assert fix_rtl("") == ""
    assert fix_rtl(None) == ""


def test_parse_amount_trailing_minus() -> None:
    assert parse_amount("6,882-") == -6882.0


def test_parse_amount_leading_minus() -> None:
    assert parse_amount("-6,882") == -6882.0


def test_parse_amount_positive() -> None:
    assert parse_amount("6,882") == 6882.0


def test_parse_amount_none() -> None:
    assert parse_amount(None) is None


def test_parse_pct_trailing_minus() -> None:
    assert parse_pct("5.65%-") == -5.65


def test_parse_pct_positive() -> None:
    assert parse_pct("20.07%") == 20.07

from util import find, normalize_2digit_year, parse_amount, parse_pct


def test_parse_amount_handles_leading_and_trailing_minus():
    assert parse_amount("6,882-") == -6882.0
    assert parse_amount("-6,882") == -6882.0
    assert parse_amount("6,882") == 6882.0
    assert parse_amount(None) is None


def test_parse_pct_strips_percent_sign():
    assert parse_pct("5.65%-") == -5.65
    assert parse_pct(None) is None


def test_normalize_2digit_year_assumes_20xx():
    assert normalize_2digit_year("17/09/24") == "17/09/2024"


def test_find_returns_first_matching_line():
    lines = ["nothing here", "account: 12345", "more text"]
    match = find(lines, r"account:\s*(\d+)")
    assert match is not None
    assert match.group(1) == "12345"


def test_find_returns_none_when_nothing_matches():
    assert find(["a", "b"], r"\d+") is None

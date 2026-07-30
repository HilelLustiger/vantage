from validity_checks import compute_return_pct, summarize_by_kind, verify_matches


def test_verify_matches_within_tolerance() -> None:
    assert verify_matches("x", 100.0, 100.5, tolerance=1.0).matched is True


def test_verify_matches_at_boundary_does_not_match() -> None:
    # Strict <, not <= — matches gemel.py's existing "within a shekel of
    # rounding" convention (abs(delta) < 1).
    assert verify_matches("x", 100.0, 101.0, tolerance=1.0).matched is False


def test_verify_matches_outside_tolerance() -> None:
    assert verify_matches("x", 100.0, 200.0, tolerance=1.0).matched is False


def test_verify_matches_default_tolerance_is_one_shekel() -> None:
    assert verify_matches("x", 0.0, 0.99).matched is True
    assert verify_matches("x", 0.0, 1.0).matched is False


def test_verify_matches_result_carries_both_sides() -> None:
    result = verify_matches("balance", 50.0, 52.0, tolerance=1.0)
    assert result.name == "balance"
    assert result.computed == 50.0
    assert result.claimed == 52.0
    assert result.matched is False


def test_compute_return_pct() -> None:
    assert compute_return_pct(500.0, 40000.0) == 1.25


def test_compute_return_pct_zero_base_returns_none() -> None:
    assert compute_return_pct(500.0, 0) is None


def test_summarize_by_kind_aggregates_per_kind() -> None:
    transactions = [
        {"kind": "buy", "amount": "-100.0"},
        {"kind": "buy", "amount": "-50.0"},
        {"kind": "dividend", "amount": "5.0"},
    ]
    assert summarize_by_kind(transactions) == {"buy": -150.0, "dividend": 5.0}


def test_summarize_by_kind_empty_list() -> None:
    assert summarize_by_kind([]) == {}

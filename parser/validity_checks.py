"""Shared validity-check primitive — ADR-0026. Every institution-specific
check (a balance identity, a running-balance check, a return-% sanity
check) reduces to the same question: does a value derived from other
extracted numbers agree with what the statement itself claims, within
tolerance? That's the one primitive here — no named per-shape wrappers
(no verify_balance/verify_running_balance); each institution's
`reconcile` derives its own `computed` side however it needs to (a sum,
a fold over rows) and calls verify_matches directly."""

from typing import Any

from document_template import ValidityResult

# One flat constant, used everywhere verify_matches is called — not
# case-specific. In principle these should match exactly; the tolerance
# exists only to absorb float noise from parsing/summing strings, not to
# paper over real discrepancies. 1 shekel is generous for that purpose on
# every check today, including the return-% sanity check, where it's even
# more forgiving since that check is explicitly non-authoritative.
DEFAULT_TOLERANCE = 1.0


def verify_matches(
    name: str, computed: float, claimed: float, tolerance: float = DEFAULT_TOLERANCE
) -> ValidityResult:
    """Does a value we derived from other extracted numbers agree with
    what the statement itself claims, within tolerance?"""
    return ValidityResult(
        name=name,
        computed=computed,
        claimed=claimed,
        matched=abs(computed - claimed) < tolerance,
    )


def compute_return_pct(gain: float, base: float) -> float | None:
    """Simple return % — the `computed` side of a return-figure check.
    Not the app's authoritative return metric; that's computed from
    committed CashFlows downstream, per ADR-0023. None when base is 0 —
    same "not meaningful, don't show it as if it were" contract used
    elsewhere for this shape of guard."""
    if not base:
        return None
    return round(gain / base * 100, 2)


def summarize_by_kind(transactions: list[dict[str, Any]]) -> dict[str, float]:
    """Total amount per common.classify_kind() bucket (buy/sell/dividend/
    ...) — generic once `kind` is known. Each transaction's `amount` is
    already a plain float string (str(parse_amount(...)) from wherever
    the transaction was built, e.g. excellence.py/hapoalim_transactions.py
    today) — not re-parsed for RTL/comma artifacts here."""
    totals: dict[str, float] = {}
    for txn in transactions:
        kind = txn["kind"]
        totals[kind] = totals.get(kind, 0.0) + float(txn["amount"])
    return totals

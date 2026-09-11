"""Fixtures below mirror test_gemel.py's real, validated scenarios
(fabricated Hebrew text, no real PII) — asserted against the new
DocumentTemplate/ExtractionEngine output shape instead of gemel.py's.
text_only_page (conftest.py) stands in for a real pdfplumber page since
Gemel's template never uses SectionSpec/TableSpec."""

from document_template import ValidityFailure
from extraction_engine import extract
from gemel_template import gemel_template

INSTITUTION = "בדיקה גמל ופנסיה"


def _extract(text_only_page, lines: list[str]):
    return extract(text_only_page(lines), gemel_template(INSTITUTION))


def test_yearly_happy_path_reconciles(text_only_page) -> None:
    result = _extract(
        text_only_page,
        [
            "תאריך הדוח: 31.12.2025",
            "שם העמית: ישראל ישראלי מספר ת.ז: 123456789 מספר חשבון: 111-222-333",
            "יתרת הכספים בחשבון בתחילת השנה 40,000 דמי ניהול מהפקדה 0%",
            "כספים שהופקדו לחשבון 10,000 דמי ניהול מחיסכון 0.80%",
            "רווחים בניכוי הוצאות ניהול השקעות 500 הוצאות ניהול השקעות 0.03%",
            "דמי ניהול שנגבו בשנה זו 500-",
            "יתרת הכספים בחשבון בסוף השנה 50,000",
            "שם המסלול תשואה עלות שנתית צפויה**",
            "בדיקה גמל להשקעה עוקב מדדי מניות 1.25% 0.91%",
        ],
    )

    assert isinstance(result, dict), result
    assert result["institution"] == INSTITUTION
    assert result["accountHolderName"] == "ישראל ישראלי"
    assert result["accountHolderId"] == "123456789"
    assert result["accountNumber"] == "111-222-333"
    assert result["asOfDate"] == "31.12.2025"
    assert result["holdings"] == [
        {
            "assetName": "בדיקה גמל להשקעה עוקב מדדי מניות",
            "quantity": "1",
            "value": "50000",
            "currency": "ILS",
            "annualReturnPct": "1.25%",
        }
    ]
    assert result["checks"] == [
        {"name": "balance", "computed": 50000.0, "claimed": 50000.0, "matched": True},
        {"name": "returnPct", "computed": 1.25, "claimed": 1.25, "matched": True},
    ]
    # #39 — surfaced for cash_flows derivation, not just the checks block.
    assert result["deposits"] == "10000.0"
    assert result["transfers"] == "0.0"  # no transfer-in line on this statement
    assert result["withdrawals"] == "0.0"
    assert result["transfersOut"] == "0.0"


def test_quarterly_loss_with_l_dash_balance_and_trailing_minus_return(text_only_page) -> None:
    # Quarterly statements use "ל-<date>" instead of "בסוף השנה" for the
    # ending balance, and negative figures render with a trailing minus
    # ("2.06%-") — a real bidi artifact, confirmed against a real quarterly
    # Meitav statement in the Phase 0 spike.
    result = _extract(
        text_only_page,
        [
            "תאריך הדוח: 31.03.2026",
            "שם העמית: ישראל ישראלי מספר ת.ז.: 123456789 מספר חשבון: 111-222-333",
            "יתרת הכספים בחשבון בתחילת השנה 50,000 דמי ניהול מהפקדה 0%",
            "כספים שהופקדו לחשבון 0 דמי ניהול מחיסכון 0.80%",
            "הפסדים בניכוי הוצאות ניהול השקעות 1,000- הוצאות ניהול השקעות 0.03%",
            "דמי ניהול שנגבו בשנה זו 100-",
            "יתרת הכספים בחשבון ל- 31.03.2026 48,900",
            "שם המסלול תשואה עלות שנתית צפויה**",
            "בדיקה גמל להשקעה עוקב מדדי מניות 2.06%- 0.89%",
        ],
    )

    assert isinstance(result, dict), result
    assert result["holdings"][0]["value"] == "48900"
    assert result["holdings"][0]["annualReturnPct"] == "2.06%-"
    balance_check = next(c for c in result["checks"] if c["name"] == "balance")
    return_check = next(c for c in result["checks"] if c["name"] == "returnPct")
    assert balance_check["matched"] is True
    assert return_check["claimed"] == -2.06


def test_transfer_in_is_included_in_reconciliation(text_only_page) -> None:
    # A missing transfer-in line is exactly what made a real yearly Harel
    # statement's reconciliation fail by precisely its value in the spike —
    # this is the regression test for that fix.
    result = _extract(
        text_only_page,
        [
            "תאריך הדוח: 31.12.2025",
            "שם: ישראל ישראלי מספר ת.ז.: 123456789 מספר חשבון: 111-222-333",
            "יתרת הכספים בחשבון בתחילת השנה 0 דמי ניהול מהפקדה 0.00%",
            "כספים שהופקדו לחשבון 5,000 דמי ניהול מחיסכון 0.41%",
            "כספים שהעברת לחשבון 20,000",
            "רווחים בניכוי הוצאות ניהול השקעות 1,000 הוצאות ניהול השקעות 0.18%",
            "דמי ניהול שנגבו בשנה זו 100-",
            "יתרת הכספים בחשבון בסוף 25,900",
            "מניות % 5.00 * תשואות שהושגו במהלך שנת",
        ],
    )

    assert isinstance(result, dict), result
    balance_check = next(c for c in result["checks"] if c["name"] == "balance")
    assert balance_check["matched"] is True
    assert balance_check["computed"] == 25900.0
    assert result["deposits"] == "5000.0"
    assert result["transfers"] == "20000.0"  # the transfer-in this test exists to cover


def test_malformed_percent_before_number_track_format(text_only_page) -> None:
    # A real, non-bug format variant seen on a real yearly Harel statement:
    # "<name> % <return>" instead of "<name> <return%> <cost%>".
    result = _extract(
        text_only_page,
        [
            "תאריך הדוח: 31.12.2025",
            "שם: ישראל ישראלי מספר ת.ז.: 123456789 מספר חשבון: 111-222-333",
            "יתרת הכספים בחשבון בסוף השנה 10,000",
            "מניות % 8.75 * תשואות שהושגו במהלך שנת",
        ],
    )

    assert isinstance(result, dict), result
    assert result["holdings"][0]["assetName"] == "מניות"
    assert result["holdings"][0]["annualReturnPct"] == "8.75%"


def test_missing_reconciliation_fields_omits_checks(text_only_page) -> None:
    result = _extract(
        text_only_page,
        [
            "תאריך הדוח: 31.12.2025",
            "שם: ישראל ישראלי מספר ת.ז.: 123456789 מספר חשבון: 111-222-333",
            "יתרת הכספים בחשבון בסוף השנה 10,000",
            "מניות 1.00% 0.50%",
        ],
    )

    assert isinstance(result, dict), result
    assert result["checks"] is None
    assert result["holdings"][0]["value"] == "10000"
    assert result["deposits"] is None  # no deposits line on this statement at all


def test_missing_required_field_reaches_needs_review(text_only_page) -> None:
    # No date line at all — asOfDate is required (unlike the
    # reconciliation-only inputs above): a Document missing something
    # this fundamental needs a human, not a silent partial result. A
    # deliberate behavior change from gemel.py, which returned asOfDate:
    # None and kept going — see #52's closing notes.
    result = _extract(
        text_only_page,
        [
            "שם: ישראל ישראלי מספר ת.ז.: 123456789 מספר חשבון: 111-222-333",
            "יתרת הכספים בחשבון בסוף השנה 10,000",
            "מניות 1.00% 0.50%",
        ],
    )

    assert isinstance(result, ValidityFailure), result
    assert any(check.name == "asOfDate" for check in result.failed_checks)


def test_balance_mismatch_reaches_needs_review(text_only_page) -> None:
    # Same reconciliation inputs as the happy-path test, but the
    # statement's own claimed ending balance is nowhere close — a real
    # data-integrity problem, not rounding noise, so this blocks the
    # Document rather than staying informational the way gemel.py's old
    # "checks.reconciles: False" did.
    result = _extract(
        text_only_page,
        [
            "תאריך הדוח: 31.12.2025",
            "שם העמית: ישראל ישראלי מספר ת.ז: 123456789 מספר חשבון: 111-222-333",
            "יתרת הכספים בחשבון בתחילת השנה 40,000 דמי ניהול מהפקדה 0%",
            "כספים שהופקדו לחשבון 10,000 דמי ניהול מחיסכון 0.80%",
            "רווחים בניכוי הוצאות ניהול השקעות 500 הוצאות ניהול השקעות 0.03%",
            "דמי ניהול שנגבו בשנה זו 500-",
            "יתרת הכספים בחשבון בסוף השנה 60,000",
            "שם המסלול תשואה עלות שנתית צפויה**",
            "בדיקה גמל להשקעה עוקב מדדי מניות 1.25% 0.91%",
        ],
    )

    assert isinstance(result, ValidityFailure), result
    balance_failure = next(c for c in result.failed_checks if c.name == "balance")
    assert balance_failure.computed == 50000.0
    assert balance_failure.claimed == 60000.0
    # The values a future manual-correction form would show are still
    # carried forward, holdings included, even though the Document didn't
    # commit.
    assert result.values["holdings"][0]["value"] == "60000"

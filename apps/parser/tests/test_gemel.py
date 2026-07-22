"""Fixtures below are fabricated Hebrew text mimicking the real label
structure/format validated against real statements during the Phase 0 spike
(sandbox/) — fake names, IDs, and amounts throughout, no real PII."""

from gemel import extract_gemel_statement

INSTITUTION = "בדיקה גמל ופנסיה"


def test_yearly_happy_path_reconciles() -> None:
    text = "\n".join(
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
        ]
    )

    result = extract_gemel_statement(text, INSTITUTION)

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
    assert result["checks"]["reconciles"] is True
    assert result["checks"]["reconciliationDelta"] == 0.0


def test_quarterly_loss_with_l_dash_balance_and_trailing_minus_return() -> None:
    # Quarterly statements use "ל-<date>" instead of "בסוף השנה" for the
    # ending balance, and negative figures render with a trailing minus
    # ("2.06%-") — a real bidi artifact, not a bug, confirmed against a real
    # quarterly Meitav statement in the Phase 0 spike.
    text = "\n".join(
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
        ]
    )

    result = extract_gemel_statement(text, INSTITUTION)

    assert result["holdings"][0]["value"] == "48900"
    assert result["holdings"][0]["annualReturnPct"] == "2.06%-"
    assert result["checks"]["reconciles"] is True
    assert result["checks"]["extractedReturnPct"] == -2.06


def test_transfer_in_is_included_in_reconciliation() -> None:
    # A missing transfer-in line is exactly what made a real yearly Harel
    # statement's reconciliation fail by precisely its value in the spike —
    # this is the regression test for that fix.
    text = "\n".join(
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
        ]
    )

    result = extract_gemel_statement(text, INSTITUTION)

    assert result["checks"]["reconciles"] is True
    assert result["checks"]["reconciliationDelta"] == 0.0


def test_malformed_percent_before_number_track_format() -> None:
    # A real, non-bug format variant seen on a real yearly Harel statement:
    # "<name> % <return>" instead of "<name> <return%> <cost%>".
    text = "\n".join(
        [
            "תאריך הדוח: 31.12.2025",
            "שם: ישראל ישראלי מספר ת.ז.: 123456789 מספר חשבון: 111-222-333",
            "יתרת הכספים בחשבון בסוף השנה 10,000",
            "מניות % 8.75 * תשואות שהושגו במהלך שנת",
        ]
    )

    result = extract_gemel_statement(text, INSTITUTION)

    assert result["holdings"][0]["assetName"] == "מניות"
    assert result["holdings"][0]["annualReturnPct"] == "8.75%"


def test_missing_reconciliation_fields_omits_checks() -> None:
    text = "\n".join(
        [
            "תאריך הדוח: 31.12.2025",
            "שם: ישראל ישראלי מספר ת.ז.: 123456789 מספר חשבון: 111-222-333",
            "יתרת הכספים בחשבון בסוף השנה 10,000",
            "מניות 1.00% 0.50%",
        ]
    )

    result = extract_gemel_statement(text, INSTITUTION)

    assert result["checks"] is None
    assert result["holdings"][0]["value"] == "10000"

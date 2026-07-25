"""Fabricated text mimicking the real Excellence (אקסלנס) brokerage-report
column layout — fake security numbers/names/values, no real PII."""

from excellence import extract_excellence_securities


def test_itemized_holdings_reconcile_to_stated_total() -> None:
    text = "\n".join(
        [
            "www.xnes.co.il",
            "ישראל ישראלי וכהן דנה לוי",
            "חשבון מספר : 999888",
            "הננו מתכבדים להציג את מצב חשבונך אצלנו נכון לתאריך: 30/06/2026",
            "מספר נייר שם נייר כמות שער נוכחי עלות הרכישה שווי נייר אחוז מהתיק",
            "בשקלים",
            "מדד 1111111בדיקה100 1,000.00 500.00 4,800.00 5,000.00 90.91",
            "יתרה כספית 0.00 0.00 0.00 500.00 9.09",
            'סה"כ 5,500.00 100.00',
        ]
    )

    result = extract_excellence_securities(text)

    assert result["institution"] == "אקסלנס"
    assert result["accountHolderNames"] == ["ישראל ישראלי", "כהן דנה לוי"]
    assert result["accountNumber"] == "999888"
    assert result["asOfDate"] == "30/06/2026"
    assert len(result["holdings"]) == 1
    holding = result["holdings"][0]
    assert holding["securityNumber"] == "1111111"
    assert holding["quantity"] == "1000.00"
    assert holding["currentPriceIls"] == 5.0  # 500 agorot -> 5.00 ILS
    assert holding["value"] == "5000.00"
    assert result["cashValue"] == 500.00
    assert result["checks"]["reconciles"] is True
    assert result["checks"]["delta"] == 0.0


def test_no_rows_still_reports_stated_total_check() -> None:
    text = '\n'.join(["ignored", 'סה"כ 0.00 100.00'])
    result = extract_excellence_securities(text)
    assert result["holdings"] == []
    assert result["checks"]["statedTotal"] == 0.0
    assert result["checks"]["reconciles"] is True


def test_no_transactions_section_is_a_no_op() -> None:
    # Matches every fixture above — no "פירוט תנועות" marker at all, as on
    # a real statement with no activity that period.
    text = "\n".join(["ignored", 'סה"כ 0.00 100.00'])
    result = extract_excellence_securities(text)
    assert result["transactions"] == []
    assert result["transactionChecks"] is None


def test_extracts_and_reconciles_a_transactions_table() -> None:
    text = "\n".join(
        [
            "www.xnes.co.il",
            "ישראל ישראלי וכהן דנה לוי",
            "חשבון מספר : 999888",
            "הננו מתכבדים להציג את מצב חשבונך אצלנו נכון לתאריך: 30/06/2026",
            "מספר נייר שם נייר כמות שער נוכחי עלות הרכישה שווי נייר אחוז מהתיק",
            "בשקלים",
            "מדד 1111111בדיקה100 10.00 500.00 45.00 50.00 90.91",
            "יתרה כספית 0.00 0.00 0.00 450.04 9.09",
            'סה"כ 500.04 100.00',
            "פירוט תנועות",
            "יום שעה מספר שם נייר סוג כמות שער ביצוע סכום עמלה מס יתרה כספית תאריך",
            "ערך נייר תנועה עסקה לחיוב/זיכוי ביצוע",
            # Deposit — no real security, a short pseudo-code ("900") too
            # short to even be a candidate identifier (see module docstring).
            "01/06/24 900 הפקדה לבנק מ בע הפועלים העברה 0.00 0.00 500.00 0.00 0.00 500.00 02/06/24",
            # Buy — real security number, matches the holding above; date
            # and Hebrew text glued together with no space ("05/06/24100"),
            # matching a real bidi artifact confirmed against a real sample.
            "בדיקה 1111111 09:59 05/06/24100מדד ק/טרום 10.00 500.00 -53.00 3.00 0.00 447.00 05/06/24",
            # Interest — a 7-digit pseudo-code ("9999905") that's the right
            # length to be a candidate but doesn't match any real holding.
            '10/06/24 9999905 פח"ק בבנק ריבית 0.00 0.00 3.04 0.00 0.20 450.04 11/06/24',
        ]
    )

    result = extract_excellence_securities(text)

    transactions = result["transactions"]
    assert len(transactions) == 3

    deposit, buy, interest = transactions

    assert deposit["date"] == "01/06/2024"  # 2-digit year normalized to 4
    assert deposit["securityNumber"] is None
    assert deposit["kind"] == "deposit"
    assert deposit["amount"] == "500.0"
    assert deposit["currency"] == "ILS"
    assert deposit["balanceAfter"] == "500.0"
    assert deposit["valueDate"] == "02/06/2024"

    assert buy["securityNumber"] == "1111111"
    assert buy["kind"] == "buy"
    assert buy["quantity"] == "10.00"
    assert buy["priceIls"] == 5.0  # 500 agorot -> 5.00 ILS
    assert buy["amount"] == "-53.0"
    assert buy["fee"] == "3.0"
    assert buy["balanceAfter"] == "447.0"

    assert interest["securityNumber"] is None  # right length, but no real match
    assert interest["kind"] == "interest"
    assert interest["amount"] == "3.04"
    assert interest["tax"] == "0.2"
    assert interest["balanceAfter"] == "450.04"

    checks = result["transactionChecks"]
    assert checks["finalBalance"] == 450.04
    assert checks["statementCashValue"] == 450.04
    assert checks["reconciles"] is True


def test_flags_a_transactions_table_that_does_not_reconcile() -> None:
    text = "\n".join(
        [
            "ignored",
            'סה"כ 0.00 100.00',
            "פירוט תנועות",
            "יום שעה מספר שם נייר סוג כמות שער ביצוע סכום עמלה מס יתרה כספית תאריך",
            "ערך נייר תנועה עסקה לחיוב/זיכוי ביצוע",
            # balanceAfter (999.00) doesn't match balanceBefore (0) + amount (500.00)
            "01/06/24 900 הפקדה לבנק מ בע הפועלים העברה 0.00 0.00 500.00 0.00 0.00 999.00 02/06/24",
        ]
    )

    result = extract_excellence_securities(text)

    assert result["transactionChecks"]["reconciles"] is False


def test_transaction_row_referencing_an_unregistered_security_stays_unmatched() -> None:
    text = "\n".join(
        [
            "www.xnes.co.il",
            "ישראל ישראלי וכהן דנה לוי",
            "מספר נייר שם נייר כמות שער נוכחי עלות הרכישה שווי נייר אחוז מהתיק",
            "בשקלים",
            "יתרה כספית 0.00 0.00 0.00 0.00 0.00",
            'סה"כ 0.00 100.00',
            "פירוט תנועות",
            "יום שעה מספר שם נייר סוג כמות שער ביצוע סכום עמלה מס יתרה כספית תאריך",
            "ערך נייר תנועה עסקה לחיוב/זיכוי ביצוע",
            # 7654321 never appears in the (empty) holdings list.
            "בדיקה 7654321 09:59 05/06/24100מדד ק/טרום 10.00 500.00 -53.00 3.00 0.00 -53.00 05/06/24",
        ]
    )

    result = extract_excellence_securities(text)

    assert result["transactions"][0]["securityNumber"] is None

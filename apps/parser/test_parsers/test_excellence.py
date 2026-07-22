"""Fabricated text mimicking the real Excellence (אקסלנס) brokerage-report
column layout — fake security numbers/names/values, no real PII."""

from parsers.excellence import extract_excellence_securities


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

"""Fabricated text mimicking the real Bank Hapoalim brokerage-report label
structure — fake names/numbers, no real PII."""

from hapoalim import extract_hapoalim_securities


def test_joint_account_holders_and_balance() -> None:
    text = "bankhapoalim.co.il 03-0000000\nשם חשבון חשבון סניף בנק\nישראל ישראלי וכהן דנה לוי 1234 567 890\nפקדון ניירות ערך נתונים ליום 31.03.2026 1\nיתרת נכסים לסוף תקופה 31.03.2026 100,000.00"

    result = extract_hapoalim_securities(text)

    assert result["institution"] == "Bank Hapoalim"
    assert result["accountHolderNames"] == ["ישראל ישראלי", "כהן דנה לוי"]
    assert result["asOfDate"] == "31.03.2026"
    assert result["holdings"] == [
        {
            "assetName": "Securities deposit",
            "quantity": "1",
            "value": "100000.00",
            "currency": "ILS",
        }
    ]


def test_no_balance_line_returns_no_holdings() -> None:
    result = extract_hapoalim_securities("nothing matches here")
    assert result["holdings"] == []
    assert result["accountHolderNames"] is None

"""Fabricated text mimicking the real Hapoalim account-transactions export
column layout — fake reference numbers/names/amounts, no real PII."""

from hapoalim_transactions import extract_hapoalim_transactions


def test_extracts_buy_and_sell_rows() -> None:
    text = "תנועות בחשבון\nמס' : 111-2222\nתאריך הפעולה פרטים אסמכתא חובה זכות\nב׳ 18/08/25 ני\"ע-קניה-נט קרן בדיקה כספית 1234567 250.64\nג׳ 10/11/25 ני\"ע-מכירה-נט קרן בדיקה כספית 1234567 100.37"

    result = extract_hapoalim_transactions(text)

    assert result["institution"] == "Bank Hapoalim"
    assert result["accountHolderNames"] is None
    assert result["accountNumber"] == "111-2222"
    assert len(result["transactions"]) == 2

    buy, sell = result["transactions"]
    assert buy["date"] == "18/08/2025"  # 2-digit year normalized to 4
    assert buy["securityNumber"] == "1234567"
    assert buy["kind"] == "buy"
    assert buy["amount"] == "250.64"
    assert buy["currency"] == "ILS"

    assert sell["date"] == "10/11/2025"
    assert sell["kind"] == "sell"
    assert sell["amount"] == "100.37"


def test_dividend_row() -> None:
    text = 'תאריך הפעולה פרטים אסמכתא חובה זכות\nד׳ 02/06/26 ני"ע-דיבידנד בנק הפועלים מ"ר 1 ש"ח ע"ש 662577 1.95'

    result = extract_hapoalim_transactions(text)

    assert result["transactions"][0]["kind"] == "dividend"
    assert result["transactions"][0]["securityNumber"] == "662577"


def test_row_with_no_recognized_keyword_is_kind_other() -> None:
    text = "תאריך הפעולה פרטים אסמכתא חובה זכות\nה׳ 03/01/25 קרן משהו שלא קיים בסיווג 9999999 5.00"

    result = extract_hapoalim_transactions(text)

    assert result["transactions"][0]["kind"] == "other"


def test_no_transaction_rows_at_all() -> None:
    text = "תנועות בחשבון\nתאריך הפעולה פרטים אסמכתא חובה זכות"

    result = extract_hapoalim_transactions(text)

    assert result["transactions"] == []
    assert result["accountNumber"] is None

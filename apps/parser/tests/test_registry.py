from registry import detect_and_extract


def test_unrecognized_content_returns_none() -> None:
    assert detect_and_extract("nothing recognizable here", "nothing recognizable here") is None


def test_dispatches_to_gemel_extractor_on_keyword_match() -> None:
    text = "\n".join(
        [
            "מיטב גמל ופנסיה בע\"מ",
            "יתרת הכספים בחשבון בסוף השנה 10,000",
        ]
    )
    result = detect_and_extract(text, text)
    assert result is not None
    assert result["institution"] == "מיטב גמל ופנסיה"


def test_hapoalim_dispatch_uses_raw_text_not_bidi_fixed() -> None:
    # The "bankhapoalim" signature is an ASCII URL — checked against
    # raw_text specifically, not the bidi-fixed text (see registry.py).
    raw = "bankhapoalim.co.il\nיתרת נכסים לסוף תקופה 31.03.2026 1,000.00"
    result = detect_and_extract(raw, raw)
    assert result is not None
    assert result["institution"] == "Bank Hapoalim"
    assert "transactions" not in result


def test_hapoalim_transactions_dispatch_is_disjoint_from_balance_report() -> None:
    # Real-collision regression guard (see registry.py / ADR-0024): the
    # balance report's own "bankhapoalim" signature must never accidentally
    # match the transactions-export document, and vice versa. Padded with
    # repeated rows (matching the real sample's actual proportions — 18 real
    # rows precede its footer URL) so "bankhapoalim" genuinely lands past
    # the balance-report matcher's [:200] window, same as the real document.
    balance_report_raw = "bankhapoalim.co.il\nיתרת נכסים לסוף תקופה 31.03.2026 1,000.00"
    assert "current-account/transactions" not in balance_report_raw

    row = 'ב׳ 18/08/25 ני"ע-קניה-נט קרן בדיקה כספית 1234567 250.64\n'
    transactions_raw = (
        row * 5 + "https://login.bankhapoalim.co.il/ng-portals/rb/he/current-account/transactions"
    )
    assert "bankhapoalim" not in transactions_raw[:200]  # confirms the padding is realistic

    result = detect_and_extract(transactions_raw, transactions_raw)
    assert result is not None
    assert result["institution"] == "Bank Hapoalim"
    assert "transactions" in result
    assert len(result["transactions"]) == 5

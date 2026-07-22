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

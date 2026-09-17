from segmentation import Bbox, Segmentation, SegmentedLine
from sensitivity import classify

# Passes the Israeli ID checksum (verified against the algorithm directly),
# not a real person's ID.
_VALID_ID = "304123458"
_INVALID_ID = "123456789"  # 9 digits, fails the checksum — not a false positive

# Position doesn't matter for any sensitivity.py test — classify() never
# reads bbox, only text/flags.
_BBOX = Bbox(x0=0.0, top=0.0, x1=0.0, bottom=0.0)


def _segmentation(lines: list[SegmentedLine], **identity_values) -> Segmentation:
    defaults = {
        "accountHolder": None,
        "accountNumber": None,
        "asOfDate": None,
        "statementBalance": None,
    }
    defaults.update(identity_values)
    return Segmentation(
        identity_values=defaults, lines=lines, page_width=600, page_height=800
    )


def test_flags_a_line_containing_a_checksum_valid_id():
    lines = [
        SegmentedLine(
            index=0, redacted=False, text=f"note {_VALID_ID} more text", bbox=_BBOX
        )
    ]
    result = classify(_segmentation(lines))
    assert result[0].flagged is True


def test_does_not_flag_a_line_whose_9digit_run_fails_the_checksum():
    lines = [
        SegmentedLine(
            index=0, redacted=False, text=f"note {_INVALID_ID} more text", bbox=_BBOX
        )
    ]
    result = classify(_segmentation(lines))
    assert result[0].flagged is False


def test_flags_a_line_that_repeats_a_captured_linking_key():
    lines = [
        SegmentedLine(
            index=0,
            redacted=False,
            text="Fund ABC, Account holder: Jane Doe",
            bbox=_BBOX,
        )
    ]
    result = classify(_segmentation(lines, accountHolder="Jane Doe"))
    assert result[0].flagged is True


def test_does_not_flag_a_line_that_repeats_a_non_linking_value():
    """A repeated asOfDate/statementBalance isn't a leak (see
    segmentation.py's own doc) — only accountHolder/accountNumber are
    genuinely identifying."""
    lines = [
        SegmentedLine(
            index=0, redacted=False, text="As of 01/03/2026, balance 1500", bbox=_BBOX
        )
    ]
    result = classify(
        _segmentation(lines, asOfDate="01/03/2026", statementBalance="1500")
    )
    assert result[0].flagged is False


def test_redacted_lines_are_left_untouched():
    lines = [SegmentedLine(index=0, redacted=True, text=None, bbox=_BBOX)]
    result = classify(_segmentation(lines))
    assert result[0].redacted is True
    assert result[0].flagged is False


def test_already_flagged_lines_are_left_untouched():
    lines = [
        SegmentedLine(
            index=0,
            redacted=False,
            text="odd line",
            bbox=_BBOX,
            flagged=True,
            flag_reason="shape",
        )
    ]
    result = classify(_segmentation(lines))
    assert result[0].flag_reason == "shape"

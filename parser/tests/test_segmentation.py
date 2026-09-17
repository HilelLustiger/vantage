from segmentation import UNRECOGNIZED_SHAPE_REASON, Bbox, SegmentedLine, segment


def _by_index(lines, i):
    return next(line for line in lines if line.index == i)


def test_linking_keys_are_redacted_with_no_text(build_page):
    page = build_page(
        [
            "Account holder: Jane Doe",
            "Account number: 12345",
            "Fund ABC 10 1500.00",
        ]
    )

    result = segment(page)

    assert result.identity_values["accountHolder"] == "Jane Doe"
    assert result.identity_values["accountNumber"] == "12345"
    holder_line = _by_index(result.lines, 0)
    number_line = _by_index(result.lines, 1)
    assert holder_line.redacted is True
    assert holder_line.text is None
    assert number_line.redacted is True
    assert number_line.text is None


def test_non_linking_identity_fields_are_included_unflagged(build_page):
    """asOfDate/statementBalance aren't linking keys — once positively
    identified via a label match, the line is included outright rather
    than also needing to clear the data-row bar (a single "label: value"
    line, by construction, rarely has 2+ amount-shaped tokens)."""
    page = build_page(["As of: 01/03/2026", "Total balance: 1500.00"])

    result = segment(page)

    assert result.identity_values["asOfDate"] == "2026-03-01"
    assert result.identity_values["statementBalance"] == "1500.00"
    for line in result.lines:
        assert line.redacted is False
        assert line.flagged is False
        assert line.text is not None


def test_asofdate_is_normalized_to_iso_for_postgres(build_page):
    """Regression: storing a raw DD/MM/YYYY string into a Postgres `date`
    column raised "date/time field value out of range" against a real
    Harel sample ("31/03/2026") — confirmed by actually running the
    pipeline end-to-end, not just unit tests."""
    page = build_page(["As of: 31/03/2026"])

    result = segment(page)

    assert result.identity_values["asOfDate"] == "2026-03-31"


def test_asofdate_2digit_year_is_normalized(build_page):
    page = build_page(["As of: 5.7.26"])

    result = segment(page)

    assert result.identity_values["asOfDate"] == "2026-07-05"


def test_generic_financial_labels_are_included_unflagged(text_lines_page):
    """Regression: confirmed missing against a real Harel yearly report —
    labeled single-figure lines that aren't identity fields, but also
    aren't covered by statementBalance's own narrower patterns."""
    page = text_lines_page(
        [
            "יתרת הכספים המיועדים למשיכה חד פעמית 272,741",
            "כספים שהעברת לחשבון 154,718",
            "דמי ניהול שנגבו בשנה זו 865-",
        ]
    )

    result = segment(page)

    for line in result.lines:
        assert line.flagged is False
        assert line.redacted is False


def test_a_table_header_with_no_trailing_figure_is_still_flagged(text_lines_page):
    """The financial-label pattern requires a trailing figure — a bare
    column-header row ("Security number, name, quantity...") isn't caught
    by it, still falls to the generic shape heuristic."""
    page = text_lines_page(["פירוט יתרות"])

    result = segment(page)

    assert result.lines[0].flagged is True


def test_a_two_amount_line_is_included_unflagged(build_page):
    page = build_page(["Fund ABC 10 1500.00"])

    result = segment(page)

    line = _by_index(result.lines, 0)
    assert line.redacted is False
    assert line.flagged is False
    assert line.text == "Fund ABC 10 1500.00"


def test_an_unrecognized_single_figure_line_is_flagged_not_dropped(build_page):
    """Never silently dropped — shown to the human with a reason, excluded
    by default (they can still choose to include it)."""
    page = build_page(["Some unrecognized figure 1500.00"])

    result = segment(page)

    line = _by_index(result.lines, 0)
    assert line.redacted is False
    assert line.flagged is True
    assert line.flag_reason == UNRECOGNIZED_SHAPE_REASON
    assert line.text == "Some unrecognized figure 1500.00"


def test_missing_identity_field_stays_none(build_page):
    page = build_page(["Fund ABC 10 1500.00"])

    result = segment(page)

    assert result.identity_values["accountHolder"] is None
    assert result.identity_values["statementBalance"] is None


def test_unlabeled_joint_holder_line_is_redacted(text_lines_page):
    """Regression: confirmed leaking on a real Bank Hapoalim sample —
    two names joined by 'ו' with no label at all, followed by 3 digit
    runs, used to pass the data-row heuristic undetected."""
    page = text_lines_page(["רבינוביץ מיה ולוסטיגר הלל דוד 7113 636 912"])

    result = segment(page)

    assert result.identity_values["accountHolder"] is not None
    line = _by_index(result.lines, 0)
    assert line.redacted is True
    assert line.text is None


def test_account_number_without_the_word_account_is_redacted(text_lines_page):
    """Regression: confirmed leaking on a real Bank Hapoalim transactions
    export — "מס' :" with no "חשבון" word at all."""
    page = text_lines_page(["מס' : 636-7113"])

    result = segment(page)

    assert result.identity_values["accountNumber"] == "636-7113"
    line = _by_index(result.lines, 0)
    assert line.redacted is True
    assert line.text is None


def test_bbox_is_normalized_against_a_zero_origin_page(build_page):
    page = build_page(["Fund ABC 10 1500.00"])

    line = _by_index(segment(page).lines, 0)

    assert line.bbox.x0 == 50.0
    assert line.bbox.top >= 0
    assert line.bbox.x1 > line.bbox.x0
    assert line.bbox.bottom > line.bbox.top


def test_bbox_is_normalized_against_a_real_offset_mediabox(text_lines_page):
    """Regression: a real Excellence sample's mediabox starts at
    (0, 822.05) instead of (0, 0) — pdfplumber's raw top/bottom/x0/x1 read
    as wildly out-of-bounds (e.g. top=1698 on a page reported as 822 tall)
    until this offset is subtracted. Confirmed by rendering the page and
    drawing rects at both the raw and the corrected coordinates — only the
    corrected ones land on the actual text."""
    page = text_lines_page(
        [
            {
                "text": "Fund ABC 10 1500.00",
                "x0": 27.5,
                "top": 1698.9,
                "x1": 296.0,
                "bottom": 1705.5,
            }
        ],
        bbox=(0, 822.05, 595.3, 1644.1),
    )

    line = _by_index(segment(page).lines, 0)

    assert line.bbox.x0 == 27.5
    assert line.bbox.top == 1698.9 - 822.05
    assert line.bbox.bottom == 1705.5 - 822.05


def test_redacted_lines_keep_their_bbox():
    """Position isn't sensitive, only content — a redacted line still
    needs a bbox so the review UI can draw a placeholder in the right
    spot on the page."""
    line = SegmentedLine(index=0, redacted=True, text=None, bbox=Bbox(1, 2, 3, 4))

    assert line.bbox == Bbox(1, 2, 3, 4)


def test_segmentation_reports_page_dimensions(build_page):
    page = build_page(["Fund ABC 10 1500.00"])

    result = segment(page)

    assert result.page_width == page.width
    assert result.page_height == page.height

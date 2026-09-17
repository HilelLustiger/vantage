"""Shared test fixtures.

build_page generates a minimal synthetic single-page PDF via reportlab and
returns the real, pdfplumber-parsed page — for ASCII content.

text_lines_page is a minimal stand-in exposing only extract_text_lines()
(all segmentation.py calls), for Hebrew content: reportlab's default font
has no Hebrew glyphs, so real PDF generation can't be used there. Lines are
pre-reversed via get_display() so segmentation's own fix_rtl() call (which
un-reverses pdfplumber's real visual-order output) turns them back into
normal, readable text — the same round-trip real PDFs go through."""

import io

import pdfplumber
import pytest
from bidi.algorithm import get_display
from reportlab.pdfgen import canvas

_PAGE_SIZE = (600, 800)
_COLUMN_X = (50, 150, 250, 350)


@pytest.fixture
def build_page():
    opened: list[pdfplumber.PDF] = []

    def _build(
        lines: list[str | tuple[str, ...]],
        y_start: float = 750,
        line_height: float = 20,
    ) -> pdfplumber.page.Page:
        """Each item is either a plain string (drawn as one line at
        x=50) or a tuple of strings (drawn as aligned cells at fixed x
        offsets — a table row)."""
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=_PAGE_SIZE)
        y = y_start
        for item in lines:
            if isinstance(item, tuple):
                for x, cell in zip(_COLUMN_X, item, strict=False):
                    c.drawString(x, y, cell)
            else:
                c.drawString(50, y, item)
            y -= line_height
        c.save()
        buf.seek(0)
        pdf = pdfplumber.open(buf)
        opened.append(pdf)
        return pdf.pages[0]

    yield _build

    for pdf in opened:
        pdf.close()


class _FakeTextLinesPage:
    """bbox defaults to a normal (0, 0)-origin page — pass an offset one
    (e.g. (0, 822.05, 595.3, 1644.1), confirmed against a real Excellence
    sample) to exercise segmentation.py's coordinate-normalization fix.
    Each line is either a plain string (bbox defaults to all-zero, for
    tests that don't care about position) or a dict with "text" plus
    explicit "x0"/"top"/"x1"/"bottom" in the *page's own* (unnormalized)
    coordinate space, same as real pdfplumber output."""

    def __init__(
        self,
        lines: list[str | dict],
        bbox: tuple[float, float, float, float] = (0, 0, 600, 800),
    ):
        self._lines = lines
        self.bbox = bbox
        self.width = bbox[2] - bbox[0]
        self.height = bbox[3] - bbox[1]

    def extract_text_lines(self):
        result = []
        for line in self._lines:
            if isinstance(line, str):
                entry = {"text": line, "x0": 0.0, "top": 0.0, "x1": 0.0, "bottom": 0.0}
            else:
                entry = dict(line)
            entry["text"] = get_display(entry["text"])
            result.append(entry)
        return result


@pytest.fixture
def text_lines_page():
    def _build(
        lines: list[str | dict],
        bbox: tuple[float, float, float, float] = (0, 0, 600, 800),
    ):
        return _FakeTextLinesPage(lines, bbox=bbox)

    return _build

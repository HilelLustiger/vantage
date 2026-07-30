"""Shared test fixtures. build_page (used by test_extraction_engine.py)
generates a minimal synthetic single-page PDF and returns the real,
pdfplumber-parsed page — the engine's unit tests exercise the actual
extraction pipeline against made-up content, not a mocked substitute
for it, same as extraction_engine.py itself was validated during
development."""

import io

import pdfplumber
import pytest
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

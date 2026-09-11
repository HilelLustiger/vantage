import io

from fastapi.testclient import TestClient
from reportlab.pdfgen import canvas

import main
from document_template import ValidityFailure, ValidityResult

client = TestClient(main.app)


def _minimal_valid_pdf() -> bytes:
    # A Canvas with nothing drawn on it produces zero pages once parsed —
    # draw a single character so pdfplumber sees a real, if content-free,
    # page (detect_and_extract needs one to even get called).
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(0, 0, "x")
    c.save()
    return buf.getvalue()


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_parse_with_unreadable_pdf_fails_cleanly() -> None:
    # Not a structurally valid PDF (no xref/Root) — pdfplumber can't even
    # open it. Must fail cleanly (ok=False), never a bare 500. Testing
    # "valid PDF but unrecognized institution" against a real generated PDF
    # is out of scope here — see parsers/registry.py's own unit test for
    # that case at the text level, and docs/private-docs/
    # auto-institution-detection.md for why real sample PDFs can't be
    # committed as fixtures.
    response = client.post(
        "/parse",
        data={"format": "pdf"},
        files={"file": ("statement.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert body["reason"]


def test_parse_rejects_unrecognized_format() -> None:
    response = client.post(
        "/parse",
        data={"format": "csv"},
        files={"file": ("statement.csv", b"a,b,c", "text/csv")},
    )
    assert response.status_code == 422


def test_parse_requires_a_file() -> None:
    response = client.post(
        "/parse",
        data={"format": "pdf"},
    )
    assert response.status_code == 422


def test_parse_reports_needs_review_on_validity_failure(monkeypatch) -> None:
    # Monkeypatching detect_and_extract exercises this response shape
    # directly, independent of which real registry entry (Gemel, since
    # #52) happens to produce one — same synthetic-data spirit as #49.
    failure = ValidityFailure(
        values={"endingBalance": None},
        failed_checks=[ValidityResult("endingBalance", None, None, False)],
    )
    monkeypatch.setattr(main, "detect_and_extract", lambda text, raw_text, page: failure)

    response = client.post(
        "/parse",
        data={"format": "pdf"},
        files={"file": ("statement.pdf", _minimal_valid_pdf(), "application/pdf")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert body["needsReview"] is True
    assert body["values"] == {"endingBalance": None}
    assert body["failedChecks"] == [
        {"name": "endingBalance", "computed": None, "claimed": None, "matched": False}
    ]

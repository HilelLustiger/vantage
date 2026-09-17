import io
import json

from fastapi.testclient import TestClient
from reportlab.pdfgen import canvas

import main
from segmentation import Bbox, Segmentation, SegmentedLine

client = TestClient(main.app)

_BBOX = Bbox(x0=1.0, top=2.0, x1=3.0, bottom=4.0)


def _pdf_bytes(lines: list[str]) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(600, 800))
    y = 750
    for line in lines:
        c.drawString(50, y, line)
        y -= 20
    c.save()
    return buf.getvalue()


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_segment_fails_on_unreadable_file():
    response = client.post(
        "/segment",
        files={"file": ("statement.pdf", b"not a pdf", "application/pdf")},
    )
    assert response.status_code == 200
    assert response.json() == {
        "outcome": "failed",
        "reason": "could not read file as a PDF",
    }


def test_segment_returns_a_content_review_with_every_line_classified(monkeypatch):
    fake_segmentation = Segmentation(
        identity_values={
            "accountHolder": "Jane Doe",
            "accountNumber": None,
            "asOfDate": "1/1/2026",
            "statementBalance": None,
        },
        lines=[
            SegmentedLine(index=0, redacted=True, text=None, bbox=_BBOX),
            SegmentedLine(
                index=1, redacted=False, text="Fund ABC 10 1500.00", bbox=_BBOX
            ),
            SegmentedLine(
                index=2,
                redacted=False,
                text="odd",
                bbox=_BBOX,
                flagged=True,
                flag_reason="shape",
            ),
        ],
        page_width=600.0,
        page_height=800.0,
    )
    monkeypatch.setattr(main, "segment", lambda page: fake_segmentation)
    monkeypatch.setattr(main, "classify", lambda segmentation: segmentation.lines)

    response = client.post(
        "/segment",
        files={"file": ("statement.pdf", _pdf_bytes(["hello"]), "application/pdf")},
    )

    body = response.json()
    assert body["outcome"] == "needs_review"
    assert body["asOfDate"] == "1/1/2026"
    assert body["review"]["reason"] == "content_review"
    bbox = {"x0": 1.0, "top": 2.0, "x1": 3.0, "bottom": 4.0}
    assert body["review"]["lines"] == [
        {
            "index": 0,
            "status": "redacted",
            "text": None,
            "flagReason": None,
            "bbox": bbox,
        },
        {
            "index": 1,
            "status": "included",
            "text": "Fund ABC 10 1500.00",
            "flagReason": None,
            "bbox": bbox,
        },
        {
            "index": 2,
            "status": "flagged",
            "text": "odd",
            "flagReason": "shape",
            "bbox": bbox,
        },
    ]
    assert body["review"]["pageWidth"] == 600.0
    assert body["review"]["pageHeight"] == 800.0
    assert body["review"]["identityValues"]["accountHolder"] == "Jane Doe"


def test_extract_calls_the_model_with_the_given_buffer_and_formats_the_result(
    monkeypatch,
):
    captured_buffer = {}

    def _fake_extract(buffer):
        captured_buffer["value"] = buffer
        return "llm-result"

    monkeypatch.setattr(main, "extract_with_model", _fake_extract)
    monkeypatch.setattr(
        main,
        "format_result",
        lambda identity_values, llm_result, existing_assets: {
            "outcome": "committed",
            "asOfDate": identity_values.get("asOfDate"),
            "holdings": [],
            "transactions": [],
            "receivedExistingAssets": existing_assets,
        },
    )

    response = client.post(
        "/extract",
        data={
            "buffer": "Fund ABC 10 1500.00",
            "identityValues": json.dumps({"asOfDate": "1/1/2026"}),
            "existingAssets": json.dumps([{"id": "asset-1"}]),
        },
    )

    body = response.json()
    assert captured_buffer["value"] == "Fund ABC 10 1500.00"
    assert body["outcome"] == "committed"
    assert body["asOfDate"] == "1/1/2026"
    assert body["receivedExistingAssets"] == [{"id": "asset-1"}]

import json
from typing import Any

import pdfplumber
from fastapi import FastAPI, File, Form, UploadFile

from extraction import extract_with_model
from formatting import format_result
from segmentation import segment
from sensitivity import classify

app = FastAPI()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/segment")
async def segment_document(
    file: UploadFile = File(...),  # noqa: B008 — FastAPI's own idiomatic DI pattern
) -> dict[str, Any]:
    """Stages 1+2 only — never calls the model. Every document gets a
    content_review: a human reviews exactly what's about to be sent, line
    by line, before /extract is ever called. This gate runs for every
    document today; backend/UI can make it conditional later without any
    change here."""
    try:
        with pdfplumber.open(file.file) as pdf:
            if not pdf.pages:
                return {"outcome": "failed", "reason": "empty PDF"}
            page = pdf.pages[0]
    except Exception:  # noqa: BLE001 — deliberate fail-safe boundary: an
        # unreadable upload should fail cleanly, never a bare 500 (ADR-0014's
        # fail-loud philosophy).
        return {"outcome": "failed", "reason": "could not read file as a PDF"}

    segmentation = segment(page)
    lines = classify(segmentation)

    return {
        "outcome": "needs_review",
        "asOfDate": segmentation.identity_values.get("asOfDate"),
        "review": {
            "reason": "content_review",
            "lines": [
                {
                    "index": line.index,
                    "status": "redacted"
                    if line.redacted
                    else ("flagged" if line.flagged else "included"),
                    "text": line.text,
                    "flagReason": line.flag_reason,
                    "bbox": {
                        "x0": line.bbox.x0,
                        "top": line.bbox.top,
                        "x1": line.bbox.x1,
                        "bottom": line.bbox.bottom,
                    },
                }
                for line in lines
            ],
            "pageWidth": segmentation.page_width,
            "pageHeight": segmentation.page_height,
            # Backend-internal only — never forwarded to web's DocumentReview
            # (see getDocumentReview in backend/src/services/documents.ts).
            # Held on the Document row until resolve, then handed back to
            # /extract exactly as captured here.
            "identityValues": segmentation.identity_values,
        },
    }


@app.post("/extract")
async def extract_document(
    buffer: str = Form(...),
    identityValues: str = Form(...),
    existingAssets: str = Form("[]"),
) -> dict[str, Any]:
    """Stages 3+4 — only ever called with content a human has already
    approved (backend enforces this; this endpoint itself trusts its
    caller, same as ADR-0001's "backend never delegates the Document state
    decision to parser" — parser just computes, backend decides)."""
    llm_result = extract_with_model(buffer)
    return format_result(
        json.loads(identityValues), llm_result, json.loads(existingAssets)
    )

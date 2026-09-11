from dataclasses import asdict
from typing import Any, Literal

import pdfplumber
from fastapi import FastAPI, File, Form, UploadFile
from pydantic import BaseModel

from common import fix_rtl
from document_template import ValidityFailure
from registry import detect_and_extract

app = FastAPI()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


class ParseResponse(BaseModel):
    ok: bool
    data: Any | None = None
    reason: str | None = None
    # A third outcome alongside ok=True/False (ADR-0026): the Document was
    # recognized, but ExtractionEngine's completeness gate or a reconcile
    # check found something needing a human — never true when ok=True.
    needsReview: bool = False
    values: Any | None = None
    failedChecks: list[dict[str, Any]] | None = None


@app.post("/parse")
async def parse(
    format: Literal["pdf"] = Form(...),
    file: UploadFile = File(...),  # noqa: B008 — FastAPI's own idiomatic DI pattern
) -> ParseResponse:
    # institution is deliberately not a request field — ADR-0021: the
    # caller no longer resolves it in advance, this service detects it from
    # the file's own content instead (parsers/registry.py).
    try:
        with pdfplumber.open(file.file) as pdf:
            if not pdf.pages:
                return ParseResponse(ok=False, reason="no matching parser (unrecognized institution)")
            page = pdf.pages[0]
            raw_text = page.extract_text() or ""
    except Exception:  # noqa: BLE001 — deliberate fail-safe boundary, see below
        # A corrupt/unreadable upload should fail cleanly, same as any
        # other unrecognized input — never a bare 500 (ADR-0014's fail-loud
        # philosophy applies to "can't even read this," not just "don't
        # recognize the institution"). Deliberately narrow: only wraps
        # opening/reading the file — a real bug in detect_and_extract below
        # (e.g. a misconfigured template) must surface as itself, not get
        # mislabeled as an unreadable file.
        return ParseResponse(ok=False, reason="could not read file as a PDF")
    text = fix_rtl(raw_text)

    # page stays usable here even though `with` has exited — pdfplumber
    # caches each page's parsed structures, no further file I/O needed
    # (confirmed empirically). ExtractionEngine-backed entries (Gemel;
    # #53-#55 next) need the live Page, not just text, for region-cropping/
    # table extraction.
    data = detect_and_extract(text, raw_text, page)

    if data is None:
        return ParseResponse(ok=False, reason="no matching parser (unrecognized institution)")
    if isinstance(data, ValidityFailure):
        return ParseResponse(
            ok=False,
            needsReview=True,
            values=data.values,
            failedChecks=[asdict(check) for check in data.failed_checks],
        )
    return ParseResponse(ok=True, data=data)

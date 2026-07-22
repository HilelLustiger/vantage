from typing import Any, Literal

import pdfplumber
from fastapi import FastAPI, File, Form, UploadFile
from pydantic import BaseModel

from parsers.common import fix_rtl
from parsers.registry import detect_and_extract

app = FastAPI()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


class ParseResponse(BaseModel):
    ok: bool
    data: Any | None = None
    reason: str | None = None


@app.post("/parse")
async def parse(
    format: Literal["pdf"] = Form(...),
    file: UploadFile = File(...),
) -> ParseResponse:
    # institution is deliberately not a request field — ADR-0021: the
    # caller no longer resolves it in advance, this service detects it from
    # the file's own content instead (parsers/registry.py).
    try:
        with pdfplumber.open(file.file) as pdf:
            raw_text = ""
            if pdf.pages:
                raw_text = pdf.pages[0].extract_text() or ""
    except Exception:
        # A corrupt/unreadable upload should fail cleanly, same as any
        # other unrecognized input — never a bare 500 (ADR-0014's fail-loud
        # philosophy applies to "can't even read this," not just "don't
        # recognize the institution").
        return ParseResponse(ok=False, reason="could not read file as a PDF")
    text = fix_rtl(raw_text)

    data = detect_and_extract(text, raw_text)
    if data is None:
        return ParseResponse(ok=False, reason="no matching parser (unrecognized institution)")
    return ParseResponse(ok=True, data=data)

"""Stage 4 — the model call: the one piece of extraction genuinely hard to
generalize across institutions' own varying wording (balance labels,
holdings/transaction tables) — ADR-0008. Same schema, same prompt, same
model for every institution; nothing here is institution-specific."""

from __future__ import annotations

from typing import Literal

import anthropic
from pydantic import BaseModel

_MODEL = "claude-opus-5"

_SYSTEM_PROMPT = """You are extracting structured financial data from one \
section of a financial institution's statement. The text has already been \
verified to contain no personally-identifying information.

Extract two kinds of line, independently — a statement can report either, \
both, or neither:
- "holdings": what an asset is worth right now (a point-in-time balance).
- "transactions": dated activity during the statement period (a buy, sell, \
deposit, or withdrawal).

Never infer one from the other. Only report a transaction if the statement \
itself states it explicitly with a date; a holding's value differing from a \
prior period is not a transaction. If a field genuinely isn't stated, use \
your best judgment for optional fields and omit them; do not fabricate a \
value that isn't present in the text."""


class LLMHoldingLine(BaseModel):
    assetName: str
    quantity: str
    value: str
    currency: str
    ticker: str | None = None
    isin: str | None = None
    securityNumber: str | None = None


class LLMTransactionLine(BaseModel):
    assetName: str
    occurredAt: str
    kind: Literal["buy", "sell", "deposit", "withdrawal"]
    # Absent for a pure-cash deposit/withdrawal (no Asset quantity moves).
    quantityDelta: str | None = None
    amount: str
    currency: str
    ticker: str | None = None
    isin: str | None = None
    securityNumber: str | None = None


class LLMExtractionResult(BaseModel):
    holdings: list[LLMHoldingLine]
    transactions: list[LLMTransactionLine]


def extract_with_model(buffer: str) -> LLMExtractionResult:
    client = anthropic.Anthropic()
    response = client.messages.parse(
        model=_MODEL,
        max_tokens=16000,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": buffer}],
        output_format=LLMExtractionResult,
    )
    return response.parsed_output

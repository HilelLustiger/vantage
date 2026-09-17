"""Stage 4 — the agreed format: merge stage 1's locally-captured identity
values with the model's extraction, run the one generic validity check
(holdings total vs. the locally-captured statementBalance — institution-
agnostic, since both sides come from generic mechanisms, not per-
institution knowledge), attempt deterministic Asset matching
(ticker/ISIN/securityNumber — ADR-0004, never AI/fuzzy), and build the
exact shape backend/src/services/parser.ts's ParseDocumentResult expects."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from extraction import LLMExtractionResult, LLMHoldingLine, LLMTransactionLine
from util import parse_amount


@dataclass
class ValidityResult:
    name: str
    computed: float | None
    claimed: float | None
    matched: bool


def verify_matches(
    name: str, computed: float, claimed: float, tolerance: float = 1.0
) -> ValidityResult:
    return ValidityResult(
        name=name,
        computed=computed,
        claimed=claimed,
        matched=abs(computed - claimed) < tolerance,
    )


def _holding_line(
    index: int, h: LLMHoldingLine, resolved_asset_id: str | None
) -> dict[str, Any]:
    line: dict[str, Any] = {
        "index": index,
        "kind": "holding",
        "assetName": h.assetName,
        "quantity": h.quantity,
        "value": h.value,
        "currency": h.currency,
    }
    if resolved_asset_id:
        line["resolvedAssetId"] = resolved_asset_id
    return line


def _transaction_line(
    index: int, t: LLMTransactionLine, resolved_asset_id: str | None
) -> dict[str, Any]:
    line: dict[str, Any] = {
        "index": index,
        "kind": "transaction",
        "assetName": t.assetName,
        "occurredAt": t.occurredAt,
        "transactionKind": t.kind,
        "amount": t.amount,
        "currency": t.currency,
    }
    if t.quantityDelta is not None:
        line["quantityDelta"] = t.quantityDelta
    if resolved_asset_id:
        line["resolvedAssetId"] = resolved_asset_id
    return line


def _match_asset(
    line: LLMHoldingLine | LLMTransactionLine, existing_assets: list[dict[str, Any]]
) -> str | None:
    """Deterministic only — exact ticker/ISIN/securityNumber match against
    the Asset registry backend sent. Never fuzzy, never AI (ADR-0004)."""
    for asset in existing_assets:
        if line.ticker and asset.get("ticker") == line.ticker:
            return asset["id"]
        if line.isin and asset.get("isin") == line.isin:
            return asset["id"]
        if line.securityNumber and asset.get("securityNumber") == line.securityNumber:
            return asset["id"]
    return None


def _check_balance(
    identity_values: dict[str, str | None], llm_result: LLMExtractionResult
) -> ValidityResult | None:
    """The one validity check every document can support without any
    institution-specific knowledge: does the model's holdings total agree
    with the statement's own stated balance (captured locally, stage 1)?
    None (skipped, not failed) when statementBalance wasn't found — plenty
    of real statements never state one plainly enough to match generically."""
    claimed = identity_values.get("statementBalance")
    if claimed is None or not llm_result.holdings:
        return None
    computed = sum(parse_amount(h.value) or 0.0 for h in llm_result.holdings)
    return verify_matches("statementBalance", computed, parse_amount(claimed) or 0.0)


def format_result(
    identity_values: dict[str, str | None],
    llm_result: LLMExtractionResult,
    existing_assets: list[dict[str, Any]],
) -> dict[str, Any]:
    as_of_date = identity_values.get("asOfDate")

    lines = []
    all_resolved = True
    index = 0
    for holding in llm_result.holdings:
        resolved_id = _match_asset(holding, existing_assets)
        lines.append(_holding_line(index, holding, resolved_id))
        all_resolved = all_resolved and resolved_id is not None
        index += 1
    for transaction in llm_result.transactions:
        resolved_id = _match_asset(transaction, existing_assets)
        lines.append(_transaction_line(index, transaction, resolved_id))
        all_resolved = all_resolved and resolved_id is not None
        index += 1

    balance_check = _check_balance(identity_values, llm_result)
    if balance_check is not None and not balance_check.matched:
        return {
            "outcome": "needs_review",
            "asOfDate": as_of_date,
            "review": {
                "reason": "extraction_review",
                "lines": lines,
                "failedChecks": [asdict(balance_check)],
            },
        }

    if all_resolved:
        return {
            "outcome": "committed",
            "asOfDate": as_of_date,
            "holdings": [
                {
                    "assetId": line["resolvedAssetId"],
                    "quantity": line["quantity"],
                    "value": line["value"],
                    "currency": line["currency"],
                }
                for line in lines
                if line["kind"] == "holding"
            ],
            "transactions": [
                {
                    "assetId": line["resolvedAssetId"],
                    "occurredAt": line["occurredAt"],
                    "quantityDelta": line.get("quantityDelta", "0"),
                    "amount": line["amount"],
                    "currency": line["currency"],
                    "kind": line["transactionKind"],
                }
                for line in lines
                if line["kind"] == "transaction"
            ],
        }

    return {
        "outcome": "needs_review",
        "asOfDate": as_of_date,
        "review": {"reason": "extraction_review", "lines": lines, "failedChecks": []},
    }

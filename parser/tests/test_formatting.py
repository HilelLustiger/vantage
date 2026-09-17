from extraction import LLMExtractionResult, LLMHoldingLine, LLMTransactionLine
from formatting import format_result


def _identity_values(**overrides):
    defaults = {
        "accountHolder": None,
        "accountNumber": None,
        "asOfDate": None,
        "statementBalance": None,
    }
    defaults.update(overrides)
    return defaults


def test_format_result_commits_when_every_line_resolves_and_balance_matches():
    llm_result = LLMExtractionResult(
        holdings=[
            LLMHoldingLine(
                assetName="Fund ABC",
                quantity="1",
                value="1500",
                currency="ILS",
                ticker="ABC",
            )
        ],
        transactions=[
            LLMTransactionLine(
                assetName="Fund ABC",
                occurredAt="01/03/2026",
                kind="buy",
                amount="500",
                currency="ILS",
                ticker="ABC",
            )
        ],
    )
    existing_assets = [{"id": "asset-1", "ticker": "ABC"}]
    identity_values = _identity_values(asOfDate="01/03/2026", statementBalance="1500")

    result = format_result(identity_values, llm_result, existing_assets)

    assert result["outcome"] == "committed"
    assert result["asOfDate"] == "01/03/2026"
    assert result["holdings"] == [
        {"assetId": "asset-1", "quantity": "1", "value": "1500", "currency": "ILS"}
    ]
    assert result["transactions"] == [
        {
            "assetId": "asset-1",
            "occurredAt": "01/03/2026",
            "quantityDelta": "0",
            "amount": "500",
            "currency": "ILS",
            "kind": "buy",
        }
    ]


def test_format_result_needs_review_when_a_line_has_no_match():
    llm_result = LLMExtractionResult(
        holdings=[
            LLMHoldingLine(
                assetName="Unknown Fund", quantity="1", value="1500", currency="ILS"
            )
        ],
        transactions=[],
    )
    identity_values = _identity_values(asOfDate="01/03/2026")

    result = format_result(identity_values, llm_result, existing_assets=[])

    assert result["outcome"] == "needs_review"
    assert result["review"]["reason"] == "extraction_review"
    assert result["review"]["failedChecks"] == []
    assert result["review"]["lines"] == [
        {
            "index": 0,
            "kind": "holding",
            "assetName": "Unknown Fund",
            "quantity": "1",
            "value": "1500",
            "currency": "ILS",
        }
    ]


def test_format_result_needs_review_when_holdings_total_disagrees_with_statement_balance():
    llm_result = LLMExtractionResult(
        holdings=[
            LLMHoldingLine(
                assetName="Fund ABC",
                quantity="1",
                value="1500",
                currency="ILS",
                ticker="ABC",
            )
        ],
        transactions=[],
    )
    existing_assets = [{"id": "asset-1", "ticker": "ABC"}]
    identity_values = _identity_values(asOfDate="01/03/2026", statementBalance="9000")

    result = format_result(identity_values, llm_result, existing_assets)

    assert result["outcome"] == "needs_review"
    assert result["review"]["reason"] == "extraction_review"
    assert result["review"]["failedChecks"] == [
        {
            "name": "statementBalance",
            "computed": 1500.0,
            "claimed": 9000.0,
            "matched": False,
        }
    ]


def test_format_result_skips_balance_check_when_no_statement_balance_was_captured():
    llm_result = LLMExtractionResult(
        holdings=[
            LLMHoldingLine(
                assetName="Fund ABC",
                quantity="1",
                value="1500",
                currency="ILS",
                ticker="ABC",
            )
        ],
        transactions=[],
    )
    existing_assets = [{"id": "asset-1", "ticker": "ABC"}]
    identity_values = _identity_values(asOfDate="01/03/2026")

    result = format_result(identity_values, llm_result, existing_assets)

    assert result["outcome"] == "committed"

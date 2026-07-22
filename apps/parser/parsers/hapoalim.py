"""Bank Hapoalim securities-deposit (brokerage) quarterly report — a
completely different layout from the Gemel statements: a joint account (two
holder names), asset value as a running balance rather than a named fund.
See docs/private-docs/auto-institution-detection.md."""

from typing import Any

from .common import find


def extract_hapoalim_securities(text: str) -> dict[str, Any]:
    lines = text.split("\n")

    holders_match = find(lines, r"^(\S+\s+\S+)\s*ו(\S+\s+\S+\s+\S+)\s+(\d+)\s+(\d+)\s+(\d+)$")
    date_match = find(lines, r"נתונים ליום\s*(\d[\d.]*)")
    balance_match = find(lines, r"יתרת נכסים לסוף תקופה\s*[\d./]+\s*(\d[\d,.]*)")

    return {
        "institution": "Bank Hapoalim",
        "accountHolderNames": (
            [holders_match.group(1).strip(), holders_match.group(2).strip()]
            if holders_match
            else None
        ),
        "asOfDate": date_match.group(1) if date_match else None,
        "holdings": [
            {
                # Itemized holdings need per-security parsing — not attempted
                # here, this format only surfaces the aggregate balance.
                "assetName": "Securities deposit",
                "quantity": "1",
                "value": balance_match.group(1).replace(",", "") if balance_match else None,
                "currency": "ILS",
            }
        ]
        if balance_match
        else [],
    }

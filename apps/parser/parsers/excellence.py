"""Excellence (אקסלנס) brokerage account balance report — a third, distinct
layout: real itemized securities (index funds here), not a pooled fund
balance (Gemel) or an aggregate-only balance (Hapoalim). Column layout:
security number, name, quantity, current price (in AGOROT — 1/100 ILS,
confirmed by quantity*price/100 == value against real data), purchase cost,
value (ILS), % of portfolio. See docs/private-docs/auto-institution-detection.md."""

import re
from typing import Any

from .common import find, parse_amount


def extract_excellence_securities(text: str) -> dict[str, Any]:
    lines = text.split("\n")

    holders_match = find(lines, r"^(\S+\s+\S+)\s*ו(\S+\s+\S+\s+\S+)")
    account_match = find(lines, r"חשבון מספר\s*:\s*(\d+)")
    date_match = find(lines, r"נכון לתאריך:\s*([\d/]+)")
    total_match = find(lines, r'סה"כ\s+(\d[\d,]*\.\d{2})\s+[\d.]+\s*$')

    num = r"([\d,]+\.\d{2})"
    # Security number sits mid-string (embedded in the surrounding name text
    # by a bidi/column-merge artifact); name is best-effort, not clean, but
    # the security number is the actual matching key for Assets (ADR-0008),
    # and that extracts reliably.
    row_re = re.compile(rf"(\d{{6,7}})(.*?)\s+{num}\s+{num}\s+{num}\s+{num}\s+{num}$")
    cash_re = re.compile(rf"יתרה כספית\s+{num}\s+{num}\s+{num}\s+{num}\s+{num}$")

    holdings: list[dict[str, Any]] = []
    cash_value = 0.0
    for line in lines:
        m = row_re.search(line)
        if m:
            security_number, name, quantity, price_agorot, cost, value, pct = m.groups()
            holdings.append(
                {
                    "assetName": name.strip(),  # imperfect — see module docstring
                    "securityNumber": security_number,
                    "quantity": quantity.replace(",", ""),
                    "currentPriceIls": round(parse_amount(price_agorot) / 100, 4),
                    "purchaseCostIls": parse_amount(cost),
                    "value": value.replace(",", ""),
                    "currency": "ILS",
                    "percentOfPortfolio": pct,
                }
            )
            continue
        m = cash_re.search(line)
        if m:
            cash_value = parse_amount(m.group(4))

    checks = None
    if total_match:
        stated_total = parse_amount(total_match.group(1))
        computed_total = round(sum(parse_amount(h["value"]) for h in holdings) + cash_value, 2)
        checks = {
            "statedTotal": stated_total,
            "computedTotal": computed_total,
            "delta": round(computed_total - stated_total, 2),
            "reconciles": abs(round(computed_total - stated_total, 2)) < 1,
        }

    return {
        "institution": "אקסלנס",
        "accountHolderNames": (
            [holders_match.group(1).strip(), holders_match.group(2).strip()]
            if holders_match
            else None
        ),
        "accountNumber": account_match.group(1) if account_match else None,
        "asOfDate": date_match.group(1) if date_match else None,
        "holdings": holdings,
        "cashValue": cash_value,
        "checks": checks,
    }

"""Excellence (אקסלנס) brokerage account balance report — a third, distinct
layout: real itemized securities (index funds here), not a pooled fund
balance (Gemel) or an aggregate-only balance (Hapoalim). Column layout:
security number, name, quantity, current price (in AGOROT — 1/100 ILS,
confirmed by quantity*price/100 == value against real data), purchase cost,
value (ILS), % of portfolio. See docs/private-docs/auto-institution-detection.md.

The same statement optionally includes a second "פירוט תנועות" (transaction
detail) table when there was activity that period — see ADR-0024. Verified
against a real sample (see sandbox/) that its `amount` column is always the
authoritative net cash-flow figure: balanceAfter == previous balanceAfter +
amount, exactly, every row — fee/tax are informational breakdown components
already netted into amount, never a separate deduction to reapply."""

import re
from typing import Any

from common import find, parse_amount


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

    known_security_numbers = {h["securityNumber"] for h in holdings}
    transactions = _extract_transactions(lines, known_security_numbers)
    transaction_checks = _check_transaction_reconciliation(transactions, cash_value)

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
        "transactions": transactions,
        "transactionChecks": transaction_checks,
    }


_TXN_TABLE_MARKER = "פירוט תנועות"
_TXN_ROW_NUM = r"(-?[\d,]+\.\d{2}-?)"
_TXN_ROW_RE = re.compile(
    rf"^(.+?)\s+{_TXN_ROW_NUM}\s+{_TXN_ROW_NUM}\s+{_TXN_ROW_NUM}\s+{_TXN_ROW_NUM}"
    rf"\s+{_TXN_ROW_NUM}\s+{_TXN_ROW_NUM}\s+(\d{{2}}/\d{{2}}/\d{{2}})$"
)
_DATE_2DIGIT_YEAR_RE = re.compile(r"\d{2}/\d{2}/\d{2}")
_TIME_RE = re.compile(r"\d{2}:\d{2}")
_ID_CANDIDATE_RE = re.compile(r"\b\d{5,7}\b")

# Extensible — based only on what's actually appeared in real samples so
# far (see sandbox/). Order matters: first match wins.
_KIND_KEYWORDS = [
    ("קניה", "buy"),
    ("ק/", "buy"),
    ("מכירה", "sell"),
    ("דיבידנד", "dividend"),
    ("הפקדה", "deposit"),
    ("ריבית", "interest"),
    ("משיכה", "withdrawal"),
]


def _normalize_2digit_year(date: str) -> str:
    """'17/09/24' -> '17/09/2024' — assumes 20xx, matching every real sample
    and this app's realistic usage range. The transactions table uses
    2-digit years; the rest of the document (and every other real sample in
    this app) uses 4-digit years — a real inconsistency within one
    document, normalized here so downstream consumers see one format."""
    day, month, year = date.split("/")
    return f"{day}/{month}/20{year}"


def _classify_kind(description: str) -> str:
    for keyword, kind in _KIND_KEYWORDS:
        if keyword in description:
            return kind
    return "other"


def _extract_transactions(
    lines: list[str], known_security_numbers: set[str]
) -> list[dict[str, Any]]:
    marker_index = next((i for i, line in enumerate(lines) if _TXN_TABLE_MARKER in line), None)
    if marker_index is None:
        return []

    transactions: list[dict[str, Any]] = []
    for line in lines[marker_index + 1 :]:
        m = _TXN_ROW_RE.search(line)
        if not m:
            continue
        prefix, qty, price, amount, fee, tax, balance_after, value_date = m.groups()

        dates_found = _DATE_2DIGIT_YEAR_RE.findall(prefix)
        transaction_date = _normalize_2digit_year(dates_found[0]) if dates_found else None

        remainder = _DATE_2DIGIT_YEAR_RE.sub(" ", prefix)
        remainder = _TIME_RE.sub(" ", remainder)
        id_match = _ID_CANDIDATE_RE.search(remainder)
        candidate = id_match.group(0) if id_match else None
        if candidate:
            remainder = remainder.replace(candidate, " ", 1)
        description = " ".join(remainder.split())

        # Only a genuine match against this same document's holdings counts
        # — Excellence reuses short numeric pseudo-codes (e.g. deposits,
        # bank interest) for non-security rows, which are never in that set.
        security_number = candidate if candidate in known_security_numbers else None

        transactions.append(
            {
                "date": transaction_date,
                "securityNumber": security_number,
                "assetName": description,
                "kind": _classify_kind(description),
                "quantity": qty.replace(",", ""),
                "priceIls": round(parse_amount(price) / 100, 4) if security_number else None,
                "amount": str(parse_amount(amount)),
                "fee": str(parse_amount(fee)),
                "tax": str(parse_amount(tax)),
                "balanceAfter": str(parse_amount(balance_after)),
                "valueDate": _normalize_2digit_year(value_date),
            }
        )

    return transactions


def _check_transaction_reconciliation(
    transactions: list[dict[str, Any]], cash_value: float
) -> dict[str, Any] | None:
    """Same established pattern as the holdings `checks` block — verified
    (see module docstring): balanceAfter[i] == balanceAfter[i-1] + amount[i]
    for every row, and the final balanceAfter should match the balance
    table's own current cash value, tying the ledger back to the
    statement's authoritative total."""
    if not transactions:
        return None

    running_balance = parse_amount(transactions[0]["balanceAfter"]) - parse_amount(
        transactions[0]["amount"]
    )
    reconciles = True
    for txn in transactions:
        running_balance = round(running_balance + parse_amount(txn["amount"]), 2)
        if abs(running_balance - parse_amount(txn["balanceAfter"])) >= 0.01:
            reconciles = False
            break
    if abs(running_balance - cash_value) >= 0.01:
        reconciles = False

    return {
        "finalBalance": running_balance,
        "statementCashValue": cash_value,
        "reconciles": reconciles,
    }

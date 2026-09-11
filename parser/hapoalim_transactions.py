"""Bank Hapoalim account-transactions export ("תנועות בחשבון") — a second,
distinct document shape from the same institution as hapoalim.py's balance
report, from a different bank portal page (.../current-account/transactions,
see registry.py). No balance/holdings section at all: just dated per-security
rows (date, a description that states the transaction type directly, a
reference number, and one amount). See ADR-0024.

The "אסמכתא" reference column is a SECURITY reference, not a unique
transaction ID — confirmed against a real sample, it repeats across multiple
different-dated rows for the same fund. Same role as Excellence's
securityNumber (ADR-0024): a candidate Asset-matching key, not a dedup key.

Unlike Excellence's transactions table, no row here prints a signed amount
(only one of debit/credit prints per row; the blank cell contributes nothing
to the extracted text) or a running balance. Rather than inventing a sign or
a reconciliation check that isn't actually derivable from this document, this
extractor emits the raw unsigned amount plus a descriptive `kind` — same
precedent as gemel.py's raw deposits/withdrawals fields. Applying ADR-0023's
CashFlow sign convention is the ingest pipeline's job (#38/#39), not this
parser's."""

import re
from typing import Any

from common import classify_kind, find, normalize_2digit_year, parse_amount

_ROW_RE = re.compile(r"^(.+?)\s+(\d{6,7})\s+([\d,]+\.\d{2})$")
_DATE_2DIGIT_YEAR_RE = re.compile(r"\d{2}/\d{2}/\d{2}")
# A single Hebrew letter followed by the geresh-like day-of-week marker
# (e.g. "ב׳") that consistently leads each row — display-only, not data.
_DAY_OF_WEEK_RE = re.compile(r"^\S׳\s*")


def extract_hapoalim_transactions(text: str) -> dict[str, Any]:
    lines = text.split("\n")

    account_match = find(lines, r"מס['׳]\s*:\s*([\d-]+)")

    transactions: list[dict[str, Any]] = []
    for line in lines:
        m = _ROW_RE.search(line)
        if not m:
            continue
        prefix, reference_number, amount = m.groups()

        dates_found = _DATE_2DIGIT_YEAR_RE.findall(prefix)
        if not dates_found:
            # Not a real transaction row (e.g. an account-number or period
            # line that happens to end in a number shaped like the trailing
            # columns) — skip rather than emit a dateless row.
            continue
        date = normalize_2digit_year(dates_found[0])

        remainder = _DATE_2DIGIT_YEAR_RE.sub(" ", prefix)
        remainder = _DAY_OF_WEEK_RE.sub("", remainder.strip())
        description = " ".join(remainder.split())

        transactions.append(
            {
                "date": date,
                "securityNumber": reference_number,
                "assetName": description,
                "kind": classify_kind(description),
                "amount": str(parse_amount(amount)),
                "currency": "ILS",
            }
        )

    return {
        "institution": "Bank Hapoalim",
        "accountHolderNames": None,  # not present in this document type
        "accountNumber": account_match.group(1) if account_match else None,
        "transactions": transactions,
    }

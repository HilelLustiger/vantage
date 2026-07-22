"""Meitav / Harel Gemel (provident fund) yearly + quarterly reports — same
family of layout, small label differences between institutions and report
periods. See docs/private-docs/auto-institution-detection.md and ADR-0021."""

from typing import Any

from .common import find, parse_amount, parse_pct


def extract_gemel_statement(text: str, institution: str) -> dict[str, Any]:
    lines = text.split("\n")

    date_match = find(lines, r"תאריך הדוח:\s*([\d./]+)")
    holder_match = find(
        lines, r"(?:שם העמית|שם):\s*(.+?)\s+מספר ת\.ז\.?:\s*(\d+)\s+מספר חשבון:\s*([\d-]+)"
    )
    # Anchored to end-of-line and a tight "at most 2 words between בסוף and
    # the number" — a looser [\d,]+ scan matched a bare comma in unrelated
    # footnote prose ("...לידיעתך, הזכאים...") before reaching the real line.
    balance_match = find(
        lines,
        r"יתרת הכספים בחשבון\s+(?:בסוף(?:\s+\S+){0,2}|ל-?\s*[\d./]+)\s+(\d[\d,]*)\s*$",
    )

    # Fields used only for the reconciliation sanity-check below, not part of
    # the "official" extracted holding data (which mirrors what #21 needs).
    starting_balance_match = find(lines, r"יתרת הכספים בחשבון בתחילת השנה\s+(\d[\d,]*)\s")
    deposits_match = find(lines, r"כספים שהופקדו לחשבון\s+(\d[\d,]*)\s")
    # Not present on every statement — a Gemel/pension transfer-in from
    # another provider, distinct from a regular deposit. Missing this line
    # is exactly what made yearly Harel's reconciliation fail by precisely
    # its value (154,718) before it was added here.
    transfers_match = find(lines, r"כספים שהעברת לחשבון\s+(-?\d[\d,]*-?)\s*$")
    # Not seen with a non-zero value in any real sample yet — every period we
    # have on hand happened to have zero withdrawal activity, which is also
    # why no such line ever appeared on the period-statement pages at all
    # (that template only prints line items with actual activity, same as
    # transfers above). Labels borrowed from a same-holder document that
    # *does* show both fields explicitly (with real, if zero, values) —
    # מידע אישי - תכנית גמל להשקעה.pdf. Genuinely untested against a
    # non-zero real withdrawal; flag if this ever needs correcting.
    withdrawals_match = find(lines, r"כספים שמשכת מהחשבון\s+(-?\d[\d,]*-?)\s*$")
    transfers_out_match = find(lines, r"כספים שהעברת מהחשבון\s+(-?\d[\d,]*-?)\s*$")
    gain_loss_match = find(
        lines, r"(?:רווחים|הפסדים) בניכוי הוצאות ניהול השקעות\s+(-?\d[\d,]*-?)\s"
    )
    fees_match = find(lines, r"דמי ניהול שנגבו בשנה זו\s+(-?\d[\d,]*-?)\s*$")

    # Two shapes seen: "<name> <return%> <cost%>" (Meitav, Harel quarterly)
    # and "<name> % <return>" (Harel yearly — a real, malformed-looking
    # variant, not a bug in our extraction).
    # Negative figures can render as a *trailing* minus ("5.65%-") rather than
    # leading ("-5.65%") — a bidi artifact on negative RTL-context numbers.
    pct = r"-?[\d.]+%-?"
    track_match = find(lines, rf"^(.+?)\s+({pct})\s+({pct})$")
    if track_match:
        track_name, track_return = track_match.group(1).strip(), track_match.group(2)
    else:
        track_match = find(lines, r"^(.+?)\s*%\s*(-?[\d.]+)")
        track_name = track_match.group(1).strip() if track_match else None
        track_return = f"{track_match.group(2)}%" if track_match else None

    ending_balance = parse_amount(balance_match.group(1)) if balance_match else None
    starting_balance = (
        parse_amount(starting_balance_match.group(1)) if starting_balance_match else None
    )
    deposits = parse_amount(deposits_match.group(1)) if deposits_match else None
    # Optional field — defaults to 0 (not None) so statements without a
    # transfer-in line still reconcile, rather than skipping the check.
    transfers = parse_amount(transfers_match.group(1)) if transfers_match else 0.0
    # Same "defaults to 0, pre-signed negative when non-zero" convention as
    # fees/transfers — untested against a real non-zero case (see note above
    # where these are matched).
    withdrawals = parse_amount(withdrawals_match.group(1)) if withdrawals_match else 0.0
    transfers_out = parse_amount(transfers_out_match.group(1)) if transfers_out_match else 0.0
    gain_loss = parse_amount(gain_loss_match.group(1)) if gain_loss_match else None
    fees = parse_amount(fees_match.group(1)) if fees_match else None
    extracted_return = parse_pct(track_return)

    checks = None
    if None not in (ending_balance, starting_balance, deposits, gain_loss, fees):
        # starting + deposits + transfers + gain/loss + fees + withdrawals +
        # transfers_out should reconcile to ending — fees/withdrawals/
        # transfers_out are already signed negative in the source ("776-" =
        # a -776 deduction), so they're added, not subtracted. This is what
        # actually caught the "is the negative return real?" question during
        # the Phase 0 spike: it reconciled to the shekel, confirming a real
        # loss, not a sign-parsing bug.
        reconciled_ending = (
            starting_balance
            + deposits
            + transfers
            + gain_loss
            + fees
            + withdrawals
            + transfers_out
        )
        reconciliation_delta = round(reconciled_ending - ending_balance, 2)
        implied_return_pct = (
            round(gain_loss / starting_balance * 100, 2) if starting_balance else None
        )
        return_delta = (
            round(implied_return_pct - extracted_return, 2)
            if None not in (implied_return_pct, extracted_return)
            else None
        )
        checks = {
            "reconciledEndingBalance": reconciled_ending,
            "extractedEndingBalance": ending_balance,
            "reconciliationDelta": reconciliation_delta,
            "reconciles": abs(reconciliation_delta) < 1,  # within a shekel of rounding
            "impliedReturnPct": implied_return_pct,
            "extractedReturnPct": extracted_return,
            "returnPctDelta": return_delta,
        }

    return {
        "institution": institution,
        "accountHolderName": holder_match.group(1).strip() if holder_match else None,
        "accountHolderId": holder_match.group(2) if holder_match else None,
        "accountNumber": holder_match.group(3) if holder_match else None,
        "asOfDate": date_match.group(1) if date_match else None,
        "holdings": [
            {
                "assetName": track_name,
                "quantity": "1",  # pooled fund balance, not a unit count — see ADR-0008
                "value": balance_match.group(1).replace(",", "") if balance_match else None,
                "currency": "ILS",
                "annualReturnPct": track_return,
            }
        ]
        if balance_match
        else [],
        "checks": checks,
    }

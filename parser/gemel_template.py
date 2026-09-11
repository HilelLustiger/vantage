"""Gemel (Meitav/Harel provident-fund) DocumentTemplate — ADR-0026, #52.
Replaces gemel.py's regex-over-flattened-text with a declarative
DocumentTemplate; every FieldSpec here is whole-page (Gemel is pure
label+value matching, no genuine repeating table — never section-scoped,
per the general rule in the design sketch/ADR-0026). One template covers
both yearly and quarterly layouts, same as gemel.py did — they differ by
a relabeled field/reordered column, not a different set of fields, so
fallback patterns (tried in order, first match wins) handle both without
splitting into two templates."""

from dataclasses import asdict
from typing import Any

from common import parse_amount, parse_pct
from document_template import DocumentTemplate, FieldSpec, ValidityFailure
from validity_checks import compute_return_pct, verify_matches

# Two shapes seen for the return-track line: "<name> <return%> <cost%>"
# (Meitav, Harel quarterly) and "<name> % <return>" (Harel yearly — a
# real, malformed-looking variant, not a bug). Negative figures can render
# with a *trailing* minus ("5.65%-") — a bidi artifact on negative RTL
# numbers, not a different format.
_PCT = r"-?[\d.]+%-?"


def _ensure_pct_suffix(s: str) -> str:
    """Shape 1's captured return already includes '%' (and possibly a
    trailing '-'); shape 2's doesn't. One parser handles both — shape 1
    is a no-op, shape 2 gets '%' appended — rather than two different
    parsers per pattern, which FieldSpec doesn't support anyway (one
    parser applies regardless of which pattern in the list matched)."""
    return s if "%" in s else f"{s}%"


def _fields() -> list[FieldSpec]:
    return [
        FieldSpec("asOfDate", [r"תאריך הדוח:\s*([\d./]+)"]),
        # holder_match in gemel.py captures name/id/account from one regex
        # with three groups — FieldSpec only ever reads group(1), so this
        # is three independently-anchored patterns against the same line
        # instead, each capturing just its own piece (re.search doesn't
        # require matching the whole line, so this is equivalent).
        FieldSpec("accountHolderName", [r"(?:שם העמית|שם):\s*(.+?)\s+מספר ת\.ז"], parser=str.strip),
        FieldSpec("accountHolderId", [r"מספר ת\.ז\.?:\s*(\d+)"]),
        FieldSpec("accountNumber", [r"מספר חשבון:\s*([\d-]+)"]),
        # Anchored to end-of-line and a tight "at most 2 words between
        # בסוף and the number" — a looser [\d,]+ scan matched a bare comma
        # in unrelated footnote prose before reaching the real data line
        # (the one real bug gemel.py had, fixed by tightening the pattern,
        # not by scoping the search — see ADR-0026).
        FieldSpec(
            "endingBalance",
            [r"יתרת הכספים בחשבון\s+(?:בסוף(?:\s+\S+){0,2}|ל-?\s*[\d./]+)\s+(\d[\d,]*)\s*$"],
            parser=parse_amount,
        ),
        FieldSpec(
            "assetName",
            [rf"^(.+?)\s+{_PCT}\s+{_PCT}$", r"^(.+?)\s*%\s*-?[\d.]+"],
            parser=str.strip,
        ),
        FieldSpec(
            "annualReturnPct",
            [rf"^.+?\s+({_PCT})\s+{_PCT}$", r"%\s*(-?[\d.]+)"],
            parser=_ensure_pct_suffix,
        ),
        # Reconciliation-only inputs below — never required, since a
        # missing one just means the balance-identity check gets skipped
        # (see reconcile()), not that the Document needs review. Matches
        # gemel.py's exact existing behavior: "checks = None" when any of
        # these is absent, everything else about the Document is still
        # trusted.
        FieldSpec(
            "startingBalance",
            [r"יתרת הכספים בחשבון בתחילת השנה\s+(\d[\d,]*)\s"],
            parser=parse_amount,
            required=False,
        ),
        FieldSpec(
            "deposits",
            [r"כספים שהופקדו לחשבון\s+(\d[\d,]*)\s"],
            parser=parse_amount,
            required=False,
        ),
        FieldSpec(
            "gainLoss",
            [r"(?:רווחים|הפסדים) בניכוי הוצאות ניהול השקעות\s+(-?\d[\d,]*-?)\s"],
            parser=parse_amount,
            required=False,
        ),
        FieldSpec(
            "fees",
            [r"דמי ניהול שנגבו בשנה זו\s+(-?\d[\d,]*-?)\s*$"],
            parser=parse_amount,
            required=False,
        ),
        # Optional — default 0.0 (not None) so a statement with no
        # transfer-in/withdrawal activity still reconciles, rather than
        # skipping the check. A missing transfer-in line is exactly what
        # made a real yearly Harel statement's reconciliation fail by
        # precisely its value during the Phase 0 spike.
        FieldSpec(
            "transfers",
            [r"כספים שהעברת לחשבון\s+(-?\d[\d,]*-?)\s*$"],
            parser=parse_amount,
            required=False,
            default=0.0,
        ),
        # Untested against a real non-zero case — every real sample on
        # hand so far happened to have zero activity here.
        FieldSpec(
            "withdrawals",
            [r"כספים שמשכת מהחשבון\s+(-?\d[\d,]*-?)\s*$"],
            parser=parse_amount,
            required=False,
            default=0.0,
        ),
        FieldSpec(
            "transfersOut",
            [r"כספים שהעברת מהחשבון\s+(-?\d[\d,]*-?)\s*$"],
            parser=parse_amount,
            required=False,
            default=0.0,
        ),
    ]


def _make_reconcile(institution: str) -> Any:
    """institution isn't extracted from the document text — the same
    template is shared by two real Institutions (מיטב/הראל), distinguished
    only by which registry entry matched, exactly like gemel.py's own
    extract_gemel_statement(text, institution) parameter today. reconcile
    closes over it here since DocumentTemplate.fields has nowhere to put
    a value that isn't read from the page."""

    def reconcile(values: dict[str, Any]) -> "dict[str, Any] | ValidityFailure":
        starting = values["startingBalance"]
        deposits = values["deposits"]
        gain_loss = values["gainLoss"]
        fees = values["fees"]
        transfers = values["transfers"]
        withdrawals = values["withdrawals"]
        transfers_out = values["transfersOut"]
        ending = values["endingBalance"]
        extracted_return = parse_pct(values["annualReturnPct"])

        result = dict(values)
        result["institution"] = institution
        result["deposits"] = str(deposits) if deposits is not None else None
        result["transfers"] = str(transfers)
        result["withdrawals"] = str(withdrawals)
        result["transfersOut"] = str(transfers_out)
        # endingBalance is only ever a whole-shekel figure in this report
        # family (gemel.py's own pattern only ever captures digits/commas,
        # no decimal point) — int() is lossless here, and matches
        # holdings.value never carrying a trailing ".0" the way
        # deposits/transfers do.
        result["holdings"] = [
            {
                "assetName": values["assetName"],
                "quantity": "1",  # pooled fund balance, not a unit count — ADR-0008
                "value": str(int(ending)),
                "currency": "ILS",
                "annualReturnPct": values["annualReturnPct"],
            }
        ]
        del result["assetName"], result["endingBalance"]

        checks = []
        failed = []
        if None not in (starting, deposits, gain_loss, fees):
            # starting + deposits + transfers + gain/loss + fees +
            # withdrawals + transfers_out should reconcile to ending —
            # fees/withdrawals/transfers_out are already signed negative
            # in the source ("776-" = a -776 deduction), so they're
            # added, not subtracted.
            computed_ending = (
                starting + deposits + transfers + gain_loss + fees + withdrawals + transfers_out
            )
            balance_check = verify_matches("balance", computed_ending, ending)
            checks.append(balance_check)
            if not balance_check.matched:
                failed.append(balance_check)

            implied_return = compute_return_pct(gain_loss, starting)
            if implied_return is not None and extracted_return is not None:
                # Informational only — never blocks the Document. The
                # statement's own printed return figure is a
                # non-authoritative sanity check (ADR-0023 computes the
                # real metric from committed CashFlows downstream), so a
                # mismatch here doesn't mean the extraction is wrong the
                # way a balance mismatch does.
                checks.append(verify_matches("returnPct", implied_return, extracted_return))

        result["checks"] = [asdict(c) for c in checks] if checks else None

        if failed:
            return ValidityFailure(values=result, failed_checks=failed)
        return result

    return reconcile


def gemel_template(institution: str) -> DocumentTemplate:
    """One per real Institution (מיטב גמל ופנסיה / הראל) — same fields and
    reconcile logic, only institution differs, so this only needs to vary
    what gets stamped onto the output, not the extraction shape itself."""
    return DocumentTemplate(
        institution=institution,
        document_type="pdf",
        layout="balance",
        fields=_fields(),
        reconcile=_make_reconcile(institution),
    )

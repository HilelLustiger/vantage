"""Declarative shapes for the generic parser architecture — ADR-0026.
Pure data: no pdfplumber dependency here, that lives in
extraction_engine.py, which interprets these against a real page."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any


@dataclass
class SectionSpec:
    """A bounded region of the page, located by its own heading text and
    cropped out before any extraction runs inside it. Used exclusively by
    TableSpec, never by FieldSpec — a FieldSpec pattern match isn't
    corrupted by unrelated page content the way table/column detection
    is, so it never needs a smaller region to search. A section's region
    runs from its own start_marker to the next SectionSpec's
    start_marker (in declaration order), or to the page bottom for the
    last one."""

    name: str
    start_marker: str


@dataclass
class FieldSpec:
    """A value matched by regex against whole-page text lines — always
    whole-page, never section-scoped. Patterns are tried in order, first
    match wins.

    required controls what happens when no pattern matches: True (the
    default) means the Document needs review — this field is load-bearing
    enough that without it, nothing downstream can trust the extraction.
    False means fall back to `default` and keep going."""

    name: str
    patterns: list[str]
    parser: Callable[[str], Any] = str
    required: bool = True
    default: Any = None


@dataclass
class ColumnSpec:
    """One column of a repeating-row table (holdings, transactions).
    Located by header text where possible, not raw position — so an
    added or reordered column doesn't silently misalign every value
    after it."""

    name: str
    header_patterns: list[str]
    parser: Callable[[str], Any] = str


@dataclass
class TableSpec:
    """A repeating-row table — Excellence's holdings/transactions,
    Hapoalim's transactions. section is required (unlike FieldSpec) — a
    genuine multi-column table can't be reliably told apart from page
    noise without cropping to its section first.

    required works like FieldSpec.required, but for "this table's marker
    wasn't found, or was found with zero data rows after it". False
    means an absent table just becomes an empty list, not a
    needs_review — e.g. Excellence's transactions table, only present
    when there was activity that period."""

    name: str
    section: str
    columns: list[ColumnSpec]
    required: bool = True


@dataclass
class DocumentTemplate:
    """One per (Institution, Document type, Layout) — pure data,
    replaces one entire hand-written parser module. `reconcile` is the
    one deliberately non-declarative hook: most of what it does turns
    out to be generic financial math (see validity_checks.py), composed
    with whatever small piece of logic is genuinely unique to this
    institution. Returns the plain `values` dict (possibly extended,
    e.g. with a computed return %) on success; returns `ValidityFailure`
    if any check didn't match."""

    institution: str
    document_type: str  # "pdf" today — every extraction primitive here
    # (pdfplumber pages, cropping, table detection) is PDF-specific; this
    # field exists now so CSV, when it's added, is a new document_type
    # rather than a second untyped axis bolted on later.
    layout: str
    sections: list[SectionSpec] = field(default_factory=list)
    fields: list[FieldSpec] = field(default_factory=list)
    tables: list[TableSpec] = field(default_factory=list)
    reconcile: Callable[[dict[str, Any]], dict[str, Any] | ValidityFailure] | None = None


@dataclass
class ValidityResult:
    """One verify_matches call's outcome, OR one required-but-missing
    FieldSpec/TableSpec — the engine reuses this same shape for both
    rather than inventing a second "reason" type, since both boil down
    to the same thing a future manual-correction form needs to show:
    what was expected vs. what was actually there. computed/claimed are
    nullable specifically for the missing-field/table case: there's no
    "computed vs claimed" pair when nothing was found at all."""

    name: str
    computed: float | None
    claimed: float | None
    matched: bool


@dataclass
class ValidityFailure:
    """What extract() returns when something needs a human to look at
    it — either the completeness gate found a required FieldSpec/
    TableSpec missing (before `reconcile` ever runs), or `reconcile`
    itself found one or more validity checks that didn't match. Carries
    the raw extracted `values` forward — on success they're not needed
    downstream, but on failure they're exactly what a future manual-
    correction form (not designed yet) would show the user to edit or
    fill in."""

    values: dict[str, Any]
    failed_checks: list[ValidityResult]

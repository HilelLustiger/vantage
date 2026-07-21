# Vantage

A private financial tracking platform where Users import statements from financial Institutions to reconstruct investment history as a series of Snapshots. Ownership of each Account is explicit and per-User, not household-wide — a User sees the Accounts they're associated with, whether held alone or jointly with another User. (Scope today: the Investments feature. A future Transactions feature will likely reuse `User`, `Account`, and `Institution`, but is not yet designed.)

## Language

**User**:
A person with a login identity in the system.
_Avoid_: Account, Member

**Account**:
A financial account held at an Institution (e.g. a specific brokerage or savings account). Visible only to the Users explicitly associated with it — one User (held individually) or several (held jointly, e.g. a couple's shared investment account).
_Avoid_: User account, Wallet

**Institution**:
The financial provider where an Account is held (e.g. a specific broker or bank).
_Avoid_: Provider, Bank

**Asset**:
A tradable financial thing that can be held — a stock, ETF, mutual fund, bond, or cash position. Tracked in one shared registry so the same Asset held across different Accounts can be aggregated into a single total, scoped to whichever Accounts the viewing User can see.
_Avoid_: Security, Instrument, Investment

**Holding**:
The fact that a specific Account held some quantity of a specific Asset, at the value recorded by a given Snapshot.
_Avoid_: Position

**Snapshot**:
The recorded state of an Account's Holdings as of a specific date, produced by importing one Document. Snapshots are never edited after creation — a corrected import for the same Account and date produces a new Snapshot that supersedes the old one.
_Avoid_: Balance, Statement

**Active Snapshot**:
The Snapshot currently treated as authoritative for a given Account and date — not yet superseded by a later import.
_Avoid_: Current snapshot, Latest snapshot

**Superseded Snapshot**:
A Snapshot that has been replaced by a later, corrected import for the same Account and date. Kept for audit history; not shown as current.
_Avoid_: Outdated snapshot — reserved for a different future concept (a Snapshot that's simply old because no newer import has happened yet, not one that was explicitly replaced).

**Document**:
The imported file (e.g. a PDF statement) that a Snapshot is derived from. Before its data is trusted, every Asset it references must be resolved — matched to an existing Asset in the registry, or confirmed as a genuinely new one.
_Avoid_: File, Report, Statement

**Portfolio**:
The aggregated view of a User's Holdings across every Account they can see (their individually-held Accounts plus any jointly-held ones), using each Account's latest Active Snapshot. Two Users with an overlapping set of visible Accounts have overlapping but distinct Portfolios.
_Avoid_: Dashboard (that's a UI surface, not this concept), Net worth (too narrow — a Portfolio covers per-Asset exposure too, not just one total figure)

**Ingest**:
The internal process that turns a confirmed Document into Snapshots and Holdings — parsing, Asset resolution, and Snapshot/Holding creation.
_Avoid_: Pipeline (CI/CD connotation), Processing (already a Document state)

# Vantage — Foundational Design Decisions

This document captures the decisions made before writing any code, so the foundation (data model, schema, import pipeline, system architecture, security architecture) is settled before implementation begins. Anything not listed as "open" below should be treated as decided.

## 1. Vision & Scope

- **What it is:** A private, self-hosted platform for a single household (currently: you + your wife) that builds a long-term financial source of truth by importing financial documents, preserving historical snapshots, and presenting dashboards. Not a SaaS product — never intended for other households.
- **Why file-import based:** Most financial institutions don't provide public APIs. Instead of live integrations, the system ingests documents (PDF now, other formats later) that you download yourself.
- **Two separate features, not one unified model:**
  1. **Investments** — building first. Snapshot-based: point-in-time positions per account, reconstructed from quarterly (or similar) reports.
  2. **Bank/Transactions** (payslips, credit cards, bank statements) — deliberately deferred. Naturally transaction/line-item based, which is a different shape of data than investment positions. Not designed in detail yet; only a UI placeholder and a generic import "front door" exist for it now.
- **AI:** Deliberately excluded from v1. Reasons: simpler architecture, deterministic behavior, easier testing, better security, fewer external dependencies, higher confidence in correctness of financial data processing. Not a permanent rejection — revisit once there's clear value.

## 2. Data Model (Investments feature)

### Entity hierarchy

```
Institution → Account → Snapshot → Holding → Asset
```

- **Institution** — a financial provider (broker/bank).
- **Account** — a specific account you hold at an Institution.
- **Snapshot** — one imported document event: "as of date D, here's the state of Account A." Reconstructs history rather than overwriting a "current" value.
- **Holding** — a line item within a Snapshot: an Asset + quantity + value, at that snapshot's date.
- **Asset** *(renamed from "Security" to avoid collision with the app's actual security architecture)* — the tradable thing itself (a stock, ETF, mutual fund, bond, or cash position). **Global/shared registry**, not per-account — this is what enables cross-account aggregation (e.g., "total Apple exposure across every account"), which is the core value of the dashboard. A fund is just an Asset like a stock; no decomposition into underlying holdings.
  - Has a **type** field (Stock, ETF, Mutual Fund, Bond, Cash, ...) — cheap to capture at import time, expensive to retrofit later (e.g., for "allocation by type" charts).
  - Matched across imports by **ticker symbol or ISIN** when available.

### Snapshot lifecycle: immutable + supersede

- Snapshots are **immutable once created** — never edited in place. Full audit trail: for a financial "source of truth," you always want to trace which document produced which number.
- Re-importing for the same Account + as-of-date is handled as an explicit **supersede**, not an overwrite:
  - `is_active: boolean` on Snapshot.
  - `superseded_by_snapshot_id`: nullable reference to the Snapshot that replaced it, set only when `is_active` flips to false. Preserves the replacement link for audit purposes.
- Exact duplicate re-uploads are auto-detected via file checksum and rejected as `Duplicate` (see Document states below) — never silently reprocessed.

### Asset resolution during import

- Parser attempts automatic match by ticker/ISIN.
- Unmatched/new assets are **not auto-created**. The Document is held in a `NeedsReview` state; you manually confirm each unmatched line as either "this is an existing Asset under a different name" or "this is a genuinely new Asset." This requires dedicated UI + backend logic.
- A merge/cleanup tool for accidentally-duplicated Assets is explicitly **deferred** to a future feature, not part of the initial build.

### Document lifecycle (separate from Snapshot lifecycle)

States for the uploaded file's processing journey:

| State | Meaning |
|---|---|
| `Uploaded` | File received, not yet processed. |
| `Processing` | Python parsing service is working on it. |
| `NeedsReview` | Parsed, but has one or more Assets that couldn't be auto-matched — waiting on manual confirmation. |
| `Committed` | Successfully processed; its data is now reflected in an active Snapshot. |
| `Failed` | Parsing errored out (unreadable file, unrecognized format). |
| `Duplicate` | Checksum matched a document already imported; auto-rejected. |

### Multi-currency

- Confirmed necessary — accounts exist in both USD and ILS.
- **Store every Holding's value in its original currency** as parsed, never convert on import (lossy/irreversible).
- Convert to a unified display currency **at read time** (dashboard render), using historical exchange rates.
- **Exchange rate source:** [Frankfurter](https://frankfurter.dev) — free, no API key, covers USD/ILS, supports historical dates back to 1999. This is treated as a **deliberate, narrow exception** to "avoid external services": it sends no personal or financial data, only a date and currency-pair (effectively public information). Every rate fetched should be cached locally so each historical date is only looked up once.

## 3. Import Pipeline

### Shared front door / feature-specific extraction split

- **Shared across both features (Investments and future Transactions):** a feature-agnostic ingestion layer — file upload, storage, and Document metadata (source/provider, document type, date range, checksum for de-dup, which feature it belongs to).
- **Not shared:** parsing/extraction logic and the resulting domain model. Investments and Transactions each get their own extraction logic entirely; no shared "extraction engine" — that would be speculative abstraction before a second real use case exists.

### Parsing architecture

- A **separate Python service**, its own Docker container, for parsing/extraction — chosen over doing this in TypeScript because PDF table extraction (turning a table of holdings into structured rows) is a harder problem, and Python's ecosystem (pdfplumber, camelot, pandas) is meaningfully more mature for it. Also allows building/testing the parsing logic independently of the rest of the app.
  - Implemented as a **minimal, always-running (while the app is up) HTTP service** with a single internal endpoint (e.g. `POST /parse`), not a per-request spun-up container and not a script invoked via Docker-socket access (ruled out as a security smell — it would grant the app control over the Docker daemon). Idle resource cost is negligible (comparable to Postgres already being in the stack) given the app itself is only running when you're using it.
  - **Zero exposed ports** — reachable only internally by the Node backend via Docker's internal network, never exposed to the host or wider network.
- **Per-(institution, format) parser registry** behind a **generic dispatch interface**. No generic/heuristic "universal parser" — with no AI to handle format variation intelligently, that would risk silent misreads on financial data, the worst possible failure mode here. Each institution+format gets its own small, dedicated parser module; unrecognized formats fail loudly (`Failed` state) rather than guessing.
  - The registry **shape** (generic interface, keyed by institution + format) is built generically from day one — this costs almost nothing and avoids having to refactor the pipeline when a second parser is added.
  - Only **one concrete parser** (one institution, PDF format) is actually built and proven end-to-end first, before any second parser or format is added.

### File formats

- **PDF first.** CSV support planned for later (some institutions may offer it, unconfirmed), fits into the same registry with no pipeline changes.

### Historical backfill

- Scope: **3–5 years** of historical quarterly reports.
- **No special "backfill mode."** It's the same single-document pipeline, just run repeatedly — Snapshots don't need to be inserted in chronological order. Only affordance worth adding: **multi-file upload** (select/drag many PDFs at once) as a UI convenience.

## 4. System Architecture

- **Tech stack:** TypeScript end-to-end (Node backend + TypeScript/React frontend) + PostgreSQL, containerized with **Docker** (Docker Compose: app container, Postgres container, Python parsing container).
- **Hosting (v1):** Runs **locally on your own machine**, started when you want to use it — not a dedicated home server, not cloud-hosted.
- **Access model:** **Open / deferred.** Not yet decided how your wife (or your phone, in the future) will connect — options discussed include LAN access from her own device, or (for phone access later) something like Tailscale, which avoids exposing the app to the public internet. This is explicitly decoupled from the auth mechanism (see below) — the network/access layer can be added later without reworking auth.
- **UI placeholder for the Transactions feature:** a disabled nav item labeled "Coming soon." No real page or logic behind it yet.

## 5. Security Architecture

- **Auth:** Built in from day one, not deferred, even though only one user exists initially.
  - Real `Users` table (not a hardcoded single-user gate).
  - Email + password login, hashed with bcrypt/argon2, server-side sessions (cookie-based).
  - **No third-party OAuth (e.g. Google).** Not a security concern — Google's login infra is more battle-tested than anything hand-built — but it conflicts with the project's own "avoid external services / privacy first" principles (login metadata would go to Google) and creates an internet dependency for logging into what's meant to be a local-only app.
  - **Password reset:** No email-based flow (would require an external email-sending service). Manual/CLI-based reset instead (e.g. an admin script or direct DB update) — acceptable given only 1–2 users, all with direct machine/DB access.
- **Repository:** Private, regardless of the fact that the code itself contains no real financial data.
- **Secrets:** `.env` file, git-ignored, injected into containers via environment variables. Never hardcoded.
- **Explicitly deferred (open decisions, revisit later):**
  - **Backup / disaster recovery** — no plan yet for what happens if the machine is lost/stolen/fails. Recommendation on the table: automated periodic backups to a physically separate location, encrypted locally before any off-site/cloud copy.
  - **Encryption at rest** — no application/DB-level encryption yet; full-disk encryption (e.g. FileVault) was suggested as the pragmatic v1 baseline but is not currently enabled. Revisit once the app is deployed somewhere with a different threat model (e.g. a rented server).
  - **Remote/multi-user access model** (LAN vs Tailscale vs other) — see System Architecture above.

## Open Questions (not yet resolved — revisit before they become blocking)

- Backup / disaster recovery plan.
- Full-disk (or other) encryption at rest.
- How your wife (and eventually your phone) will actually connect to the app once it's not just you on `localhost`.
- Whether CSV import will actually be needed/used (unconfirmed for your specific institutions).

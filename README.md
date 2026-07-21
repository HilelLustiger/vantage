# Vantage

A private, self-hosted financial tracking platform for a single household. Users
import statements from financial institutions to reconstruct investment history
as a series of immutable Snapshots, then view an aggregated Portfolio across
every Account they can see.

Not a SaaS product — runs locally, for one household.

See [`docs/DOMAIN.md`](docs/DOMAIN.md) for the domain language and
[`docs/ADR/`](docs/ADR/README.md) for the foundational design decisions
(data model, import pipeline, system architecture, security).

## Status

M0 (scaffolding & auth) in progress. See `docs/STATUS.md` locally for current
progress, and `docs/ADR/` for what's been decided.

## Development

```sh
cp .env.example .env   # then edit SESSION_SECRET/POSTGRES_PASSWORD
docker compose up
```

This starts Postgres, the backend (:3001), the frontend (:5173), and the
parser (internal-only, no host port). First run, in another terminal:

```sh
npm install
npm run db:migrate --workspace=apps/backend
npm run create-user --workspace=apps/backend -- --email you@example.com --password <password>
```

There's no signup flow — creating a user is always done this way (see
`docs/ADR/0019-manual-password-reset.md` for the reasoning behind manual
account management).

Common scripts, run across every workspace:

```sh
npm run lint --workspaces
npm run typecheck --workspaces
npm test --workspaces
```

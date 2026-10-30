# Tourest AI Lead Hunter

A **local-first, privacy-conscious** application to discover potential B2C
customers for [Tourest](https://tourest.online), identify travel/excursion
booking intent, match relevant Tourest tours, and prepare **personalized
responses for human approval**.

It is designed to cost **$0 in mandatory recurring software/API fees**:
everything runs on your machine (SQLite + a local [Ollama](https://ollama.com)
model), with **no paid APIs or cloud services**.

> **Status: Step 1 — scaffold only.**
> Scraping, messaging integrations, and AI processing are **intentionally not
> implemented yet**. The external-service modules are wired through interfaces
> and fail loudly (`501 Not Implemented`) if invoked.

---

## Tech stack

| Area        | Choice                                                            |
| ----------- | ----------------------------------------------------------------- |
| Monorepo    | npm workspaces                                                    |
| Language    | TypeScript (strict)                                               |
| Frontend    | React 18, Vite 5, Tailwind CSS v3, shadcn/ui-style components, TanStack Query, React Hook Form, Zod |
| Backend     | Express 4, Zod                                                    |
| Database    | SQLite via Drizzle ORM (`better-sqlite3`)                         |
| AI          | Local Ollama HTTP API (interface only in this step)              |
| Background  | node-cron                                                         |
| Testing     | Vitest                                                            |

All dependencies are pinned to versions compatible with **Node.js 18.20.8**
(e.g. Vite 5, Vitest 2, `better-sqlite3` 11 — later majors require Node 20+).

---

## Repository layout

```
.
├── package.json              # npm workspaces root + scripts
├── tsconfig.base.json        # shared strict TS config
├── apps/
│   ├── api/                  # Express backend (health endpoint, DI, modules)
│   │   ├── src/
│   │   │   ├── config/       # env validation (Zod)
│   │   │   ├── core/         # errors, logger, DI container
│   │   │   ├── db/           # Drizzle schema, client, migrate runner
│   │   │   ├── http/         # routes + middleware (health endpoint)
│   │   │   └── modules/      # sources, ingestion, qualification,
│   │   │                     #   tour-matching, outreach, crm, jobs, ai
│   │   └── drizzle/          # generated SQL migrations
│   └── web/                  # React + Vite frontend shell
│       └── src/
│           ├── components/ui # shadcn/ui-style primitives
│           ├── features/     # health, leads (RHF + Zod)
│           └── pages/        # Dashboard + placeholders
└── packages/
    └── shared/               # domain entities, enums, Zod schemas,
                              #   pure domain logic (+ unit tests)
```

### Core entities

`Source`, `SourceItem`, `Lead`, `Qualification`, `Tour`, `TourMatch`,
`MessageDraft`, `ActivityLog`, `JobRun`.

A **`SourceItem`** represents public content *or* an authorized incoming
message. **It is not automatically a contactable `Lead`** — a `Lead` is only
created when a source item is explicitly promoted. Every record carries
provenance (source URL), collection timestamp, access/permission status, data
retention metadata, deduplication identifiers, lead lifecycle status, and
human approval status.

---

## Prerequisites

- **Node.js 18.20.8** (see [`.nvmrc`](./.nvmrc)). With `nvm`:
  ```bash
  nvm install 18.20.8
  nvm use
  ```
- **npm 10+** (ships with Node 18.20.8).
- A C/C++ toolchain is only needed if `better-sqlite3` has no prebuilt binary
  for your platform (most macOS/Linux/Windows setups use a prebuilt binary).
- **Ollama is optional** and only needed in a later step. Nothing in Step 1
  requires it.

---

## Local startup (exact steps)

From the repository root:

```bash
# 1. Install all workspace dependencies
npm install

# 2. Create local environment files (no secrets inside)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 3. Generate the SQLite schema migration and create the database
npm run db:generate      # writes SQL to apps/api/drizzle
npm run db:migrate       # applies migrations -> apps/api/data/tourest.db

# 4. Start API (http://localhost:4000) and Web (http://localhost:5173) together
npm run dev
```

Then open:

- Web app: <http://localhost:5173>
- API health check: <http://localhost:4000/api/health>

The web app's header shows a live **API/db health badge** (it polls the health
endpoint through the Vite dev proxy).

### Running apps individually

```bash
npm run dev -w @tourest/api    # backend only
npm run dev -w @tourest/web    # frontend only
```

---

## Useful scripts (run from root)

| Command                | What it does                                              |
| ---------------------- | -------------------------------------------------------- |
| `npm run dev`          | Run API + Web concurrently                               |
| `npm run build`        | Type-check all workspaces and build the web bundle       |
| `npm run typecheck`    | `tsc --noEmit` across all workspaces                     |
| `npm test`             | Run all Vitest unit/integration tests                    |
| `npm run db:generate`  | Generate Drizzle SQL migrations from the schema          |
| `npm run db:migrate`   | Apply migrations to the local SQLite database            |

---

## Environment variables

No secrets are required. See the committed examples:

- [`apps/api/.env.example`](./apps/api/.env.example) — `PORT`, `WEB_ORIGIN`,
  `DATABASE_PATH`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `LOG_LEVEL`.
- [`apps/web/.env.example`](./apps/web/.env.example) — `VITE_API_BASE_URL`,
  `VITE_API_PROXY_TARGET`.

The SQLite database file and all `.env` files are git-ignored.

---

## Testing

```bash
npm test
```

Initial tests cover the pure domain logic in `packages/shared`
(deduplication keys, lead lifecycle/approval state machine, retention
expiry) and an API integration test that boots the Express app against an
in-memory SQLite database and asserts the health endpoint contract.

---

## Privacy & compliance notes

- **Human-in-the-loop by design:** leads and message drafts carry an explicit
  approval status; nothing is "contacted" before a human approves it.
- **Contact-permission first:** leads default to `not_contactable`.
- **Retention metadata** is attached to collected items so they can be purged
  or reviewed on schedule.
- **Provenance** (source URL + collection timestamp + access/permission
  status) is recorded for every source item.

---

## Next steps (not in this step)

Implement, module by module behind the existing interfaces: source collectors,
the ingestion pipeline, AI qualification via local Ollama, tour matching,
message drafting, and outreach channels — plus the scheduled jobs that drive
them.

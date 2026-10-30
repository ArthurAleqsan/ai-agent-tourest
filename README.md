# Tourest AI Lead Hunter

A **local-first, privacy-conscious** B2C sales dashboard for
[Tourest](https://tourest.online). It discovers travel/excursion requests,
qualifies booking intent with a **local** Ollama model, matches verified
Tourest tours, and prepares **personalized drafts for human approval**.

Mandatory recurring cost: **$0**. Everything runs on your machine (SQLite +
optional [Ollama](https://ollama.com)). No paid APIs or cloud services.

---

## What the MVP does

| Area | Behaviour |
| ---- | --------- |
| Sources | Telegram Bot API (authorized groups), Facebook **manual** import, Yandex Wordstat **CSV** |
| Qualification | Local Ollama extraction + deterministic intent scoring |
| Matching | Up to 3 verified tours; never invents prices, availability, or URLs |
| Drafts | RU/EN templates from verified fields; **pending until a human approves** |
| Dashboard | Overview, sources, requests, leads, recommendations, drafts, SEO, activity, settings |
| Jobs | Ingestion, dedup, qualification, matching, draft generation, follow-up reminders |
| Privacy | Local admin auth, audit log, contact suppression, data deletion |

Approval **does not** post to Telegram, Facebook, email, or any other platform.
There is **no unsolicited bulk messaging**.

---

## Tech stack

| Area | Choice |
| ---- | ------ |
| Monorepo | npm workspaces |
| Language | TypeScript (strict, `noUncheckedIndexedAccess`) |
| Frontend | React 18, Vite 5, Tailwind CSS v3, shadcn-style UI, TanStack Query, RHF, Zod |
| Backend | Express 4, Zod |
| Database | SQLite via Drizzle ORM (`better-sqlite3` 11) |
| AI | Local Ollama HTTP API |
| Jobs | node-cron with pause/resume, retries, concurrency limits |
| Tests | Vitest |

Pinned for **Node.js 18.20.8** (see `.nvmrc`). `better-sqlite3` v12 needs Node 20+.

---

## Local startup

```bash
# 1. Use Node 18.20.8
nvm install 18.20.8 && nvm use

# 2. Install workspace dependencies
npm install

# 3. Environment files (no secrets committed)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Optional: protect the dashboard
#   ADMIN_USERNAME=admin
#   ADMIN_PASSWORD=choose-a-strong-password

# Optional: local AI for qualification
#   ollama pull qwen3:4b
#   (leave OLLAMA_* defaults)

# 4. Database
npm run db:generate
npm run db:migrate

# 5. Run API (http://localhost:4000) + web (http://localhost:5173)
npm run dev
```

Open <http://localhost:5173>. The header health badge polls `/api/health`.

If `ADMIN_PASSWORD` is empty, authentication is **disabled** (local dev only)
and a warning is logged. Set a password before exposing the UI on a network.

---

## Useful scripts

| Command | What it does |
| ------- | ------------ |
| `npm run dev` | API + web together |
| `npm run build` | Typecheck all workspaces and build the web bundle |
| `npm run typecheck` | `tsc --noEmit` across workspaces |
| `npm test` | Vitest (shared + API + web) |
| `npm run db:generate` | Generate Drizzle SQL from the schema |
| `npm run db:migrate` | Apply migrations to local SQLite |

---

## Dashboard

Nine operator views:

1. **Overview** — confirmed counts (items, qualified/hot leads, approved drafts, contacted, replies, bookings) and source conversion rates. Bookings = leads a human marked `converted`. Nothing is estimated.
2. **Sources** — create/enable/disable collectors; manual Facebook/Yandex import.
3. **Discovered Requests** — source items; qualify; promote to a lead; delete.
4. **Qualified Leads** — search, source/destination/status filters, intent-score sort, notes, evidence/source links, manual score override, pipeline status, delete.
5. **AI Recommendations** — verified tour matches with rationales.
6. **Message Drafts** — edit, reject, approve, copy approved text (no auto-send).
7. **SEO Opportunities** — Wordstat demand (not leads).
8. **Activity History** — audit log.
9. **Settings** — job run/pause/resume/history, catalog CSV import, contact suppression, retention purge. Secrets are never displayed.

Lead pipeline statuses: `discovered`, `qualified`, `draft_ready`, `approved`,
`contacted`, `replied`, `converted`, `rejected`. You cannot mark a lead
`contacted` until it is `approved`. Suppressed contacts cannot be contacted.

---

## Background jobs

| Job | Default schedule | What it does |
| --- | ---------------- | ------------ |
| `source-ingestion` | every 2 min | Poll enabled Telegram sources |
| `deduplication` | every 15 min | Report duplicate lead keys (unique index already enforces writes) |
| `ai-qualification` | every 5 min | Qualify pending source items |
| `tour-matching` | every 5 min | Match tours to unqualified-for-matching requests |
| `draft-generation` | every 10 min | Create **pending** sales drafts |
| `follow-up-reminders` | hourly | Audit-log reminders for stalled approved/contacted leads |

Each job supports **Run now**, **pause/resume**, retries with backoff,
concurrency limits, and persisted history. Disable jobs at boot with
`JOBS_DISABLED=ai-qualification,draft-generation`.

---

## Environment (secrets stay in `.env`)

See [`apps/api/.env.example`](./apps/api/.env.example):

- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — local dashboard auth
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` — never logged
- `TOUR_CATALOG_API_URL` / `TOUR_CATALOG_API_TOKEN` — only if you have an **authorized** catalog endpoint; otherwise import CSV/JSON
- `OLLAMA_*` — local model
- `JOBS_DISABLED` — comma-separated job names

The SQLite file (`apps/api/data/`) and all `.env` files are git-ignored.

---

## Privacy & compliance

- Human approval is required before any outreach text is considered sendable.
- Copying an approved draft is a **manual** operator action.
- Leads default to `not_contactable` / `needs_review`.
- Contact suppression is a do-not-contact list.
- Source items carry retention expiry; Settings can purge expired rows.
- Activity log records promotions, overrides, drafts, deletions, and reminders.
- Telegram adapter only stores messages the Bot API delivers for allowlisted chats. No private-chat scraping, no unsolicited DMs.
- Facebook adapter is paste/CSV of public discussion content only.

---

## Remaining limitations (not in this MVP)

- No Meta Graph API, no unauthorized Facebook scraping, no browser automation.
- No free Yandex Wordstat API — CSV import only.
- No Tourest catalog API unless **you** configure an authorized URL.
- No automatic sending on Telegram, WhatsApp, or email (channel senders stay unimplemented).
- Sessions are in-memory (restarting the API signs everyone out).
- Auth is a single local admin, not multi-user SSO.
- Follow-up reminders write audit events; they do not invent replies or bookings.
- Attribution/booking metrics are **only** human-confirmed `converted` leads.

---

## License

UNLICENSED — internal Tourest tooling.

# 19 — New backend: plan

**Status:** Agreed (2026-10-23) · **Depends on:** [02](02-reports-and-triage.md)–[17](17-architecture-and-stack.md),
[20](20-roles-v2.md) · **Last updated:** 2026-10-23

## 1. Purpose

Build a new backend for E-Vigilance from scratch in `New Backend/`, with Express, JavaScript and
MongoDB. It implements the business rules agreed in docs 02–17, with the new role model in
[20](20-roles-v2.md).

| Left untouched | Why |
|---|---|
| `Backend/` (the original backend) | Runs the current system until go-live |
| `apps/api` (the NestJS rebuild) | Kept for reference; its tests describe the agreed rules in detail |

Nothing is copied from either. The new backend is written fresh, with its own structure.

## 2. Fixed constraints

- **MongoDB stays.** The citizen mobile app shares the database. It reads and writes `reports`,
  `report_replies`, `report_updates` and its own citizen accounts. The new backend must keep those
  collections and the fields the app relies on ([11](11-citizen-app-integration.md)).
- **The business rules don't change** unless a doc is changed first.
- **No real money and no real messages** until go-live: the payment simulator and the outbox, as
  agreed ([07](07-payments-and-simulator.md), [15](15-build-plan.md) D15-3).

## 3. Technology

| Area | Choice | Why |
|---|---|---|
| Runtime | Node.js 24 (LTS), ES modules (`import`/`export`) | Current, and the same as the rest of the repo |
| Web framework | **Express 5** | Chosen (2026-10-23); version 5 handles errors from `async` routes |
| Language | **JavaScript** with JSDoc types, checked by the TypeScript compiler (`checkJs`) | Plain JavaScript to write, with type errors caught before running |
| Database | MongoDB with **Mongoose** | Schemas, indexes, transactions |
| Input checking | **zod** | One schema per request body or query; clear field errors |
| Passwords | **argon2id** | Current best practice |
| Tokens | Short-lived access token (JWT, `jose`) + rotating refresh cookie (httpOnly, SameSite=Strict) | Token never stored in the browser's storage |
| Two-step sign-in | TOTP authenticator codes (`otplib`) | Required for national and division roles (D20-2) |
| Security headers, rate limits | `helmet`, `express-rate-limit` | Standard protection |
| Logging | `pino` (JSON logs, request id on every line) | Fast and searchable |
| File uploads | `busboy`, streamed to storage with a SHA-256 fingerprint | Evidence integrity ([10](10-evidence-audit-and-privacy.md)) |
| File storage | Local disk in development, Cloudflare R2 in production | Already set up for the old system |
| Tests | **Vitest** + **supertest** + `mongodb-memory-server` (replica set) | Real database, real HTTP, fast |
| Lint and format | ESLint + Prettier | Same rules across the repo |

## 4. File structure

Organised by **business area (module)**. Everything about cases lives in one folder.

```
New Backend/
├─ package.json · .env.example · jsconfig.json · eslint.config.js · vitest.config.js
├─ README.md
├─ scripts/                  local database, seed data, migrations
├─ src/
│  ├─ server.js              starts the HTTP server, background jobs and shutdown
│  ├─ app.js                 builds the Express app (no listening, so tests can use it)
│  ├─ config/
│  │  └─ env.js              reads and checks every environment variable at start-up
│  ├─ core/                  cross-cutting pieces, no business rules
│  │  ├─ http/               error handler, request validation, pagination, async helpers
│  │  ├─ errors.js           AppError and its kinds (NotFound, Forbidden, Conflict, Validation)
│  │  ├─ db/                 connection, transactions, counters (RP-, TC-, PN- numbers)
│  │  ├─ auth/               password hashing, tokens, cookies, two-step codes
│  │  ├─ access/             roles, permission matrix (doc 20), scope checks, `requirePermission`
│  │  ├─ audit/              tamper-evident audit log (hash chain)
│  │  ├─ state-machine.js    allowed status moves for each record type
│  │  ├─ time-limits.js      versioned time limits ([09](09-time-limits-and-notifications.md))
│  │  └─ logger.js
│  ├─ modules/               one folder per business area
│  │  ├─ auth/  users/  divisions/  stations/  offences/  settings/
│  │  ├─ reports/  evidence/  mobile-app/
│  │  ├─ cases/  people/
│  │  ├─ notices/  outbox/  payments/  court/
│  │  ├─ rewards/  dashboards/  audit/  system/
│  └─ jobs/                  scheduled work: overdue sweeps, time-limit alerts, mobile-app sync
└─ test/
   ├─ helpers/               app + database set-up, sign-in helpers, factories
   └─ …                      one test file per module, plus end-to-end flows
```

### 4.1 Inside every module

Taking `cases/` as the example:

```
modules/cases/
├─ cases.routes.js       URLs, permission per route, input checking — nothing else
├─ cases.controller.js   reads the request, calls the service, sends the response
├─ cases.service.js      the business rules; runs in a transaction; writes the audit log
├─ cases.model.js        Mongoose schema and indexes
├─ cases.schemas.js      zod schemas for request bodies and queries
├─ cases.policy.js       record-level rules: scope, separation of duties
├─ cases.views.js        turns a database record into the response shape
└─ index.js              what other modules may use (usually the service)
```

### 4.2 Rules

1. **One direction:** routes → controller → service → model. A service never sees `req` or `res`;
   a controller never touches the database.
2. **Modules talk through `index.js` only.** For example, the cases service calls
   `notices.issueForCase()`; it never imports the notices model.
3. **Every route declares access:** `requirePermission('cases.decide')` or `publicRoute()`. The app
   refuses to start if a route has neither (R1, deny by default).
4. **Every write** runs in a transaction and records an audit entry in the same transaction.
5. **Errors** are thrown as `AppError`s and turned into one response shape by one handler.
6. **Status changes** go through the state machine; an unlisted move is refused.
7. **Naming:** folders lowercase with hyphens; files `module.part.js`; functions `camelCase`; one
   default responsibility per file.

## 5. API conventions

| Topic | Rule |
|---|---|
| Base path | `/api/v1` |
| Resources | Plural nouns: `/cases`, `/cases/:id`, `/notices/:id` |
| Actions | `POST /cases/:id/dispatch`, `POST /notices/:id/withdraw` — one endpoint per business action, never a generic "update status" |
| Lists | `?page=1&pageSize=25&view=…&q=…`; response `{ items, total, page, pageSize }` |
| Errors | `{ error: { code, message, fields? } }` with the right HTTP status: 400 validation, 401 not signed in, 403 not allowed, 404 not found (also for records outside your scope), 409 state conflict, 429 rate limited |
| What you may do | Every record response includes `can: { dispatch: true, … }` for the signed-in user, so the frontend shows only allowed actions without repeating the rules |
| Dates | ISO 8601 in UTC; the frontend shows Sri Lanka time |
| Money | Whole rupees as integers |
| Public endpoints | Under `/api/v1/public/…`, rate-limited |

## 6. Security

- Deny by default (§4.2 rule 3); scope checked on every record (doc 20 R2).
- Refresh cookie: httpOnly, SameSite=Strict, `Secure` in production; requests that change data
  must carry the `X-Requested-With` header (CSRF protection).
- Rate limits on sign-in, two-step codes and public look-ups.
- Uploaded files checked by content, not by name; originals kept, viewing copies generated.
- Media downloaded from the mobile app only from allow-listed HTTPS hosts (no SSRF).
- Secrets only in environment variables; `.env` never committed.
- The audit log can't be edited and its hash chain shows any tampering.

## 7. Testing

- Every module has API tests against a real in-memory MongoDB replica set: the happy path, every
  refused status move, every permission (each role allowed or refused), and each separation-of-
  duties rule.
- The permission matrix in doc 20 is tested as a table: for each permission and role, one request
  that must succeed or fail.
- `npm test` must pass, and `npm run check` (lint + type check) must be clean, before any commit.

## 8. Local development

| Item | Value |
|---|---|
| Package manager | npm (`New Backend/` and `New Frontend/` are standalone projects, outside the pnpm workspace) |
| Backend port | **4200** (4000 is used by the old backend, 4100 by `apps/api`) |
| Frontend port | **5300** |
| Database | Local replica set (`npm run db:local`), database `evigilance_new` |
| Demo data | `npm run seed` — one account per role, sample stations, divisions and the offence schedule |

## 9. Phases (backend and frontend together)

Each phase delivers a working slice: API with tests, and its screens.

| Phase | Backend | Frontend | Done when |
|---|---|---|---|
| **N0 — Foundations** | App skeleton, config, errors, logging, database, audit log, roles and permissions (doc 20), sign-in with two-step codes, accounts | Skeleton, design tokens, app frame (rail, top bar, phone navigation), sign-in screens, `/design` page | Each of the 11 roles can sign in and sees only its own menu |
| **N1 — Reference data** | Divisions, stations (with areas), offence schedule, time limits | Admin screens: accounts, divisions and stations (map), offences, time limits, audit log | HQ administrator sets up a division with stations and officers |
| **N2 — Reports and evidence** | Reports, triage, evidence upload, mobile-app import | Inbox, triage split view, report record, new report | A report goes from received to accepted with evidence |
| **N3 — Cases and people** | Cases, dispatch, investigation, vehicles and persons, recommend and decide | Case queues and record, vehicle and person records | A case goes from dispatch to decision, with S1 and S2 enforced |
| **N4 — Notices** | Penalty notices, service, nomination, dispute, overdue, outbox, public look-up | Notice screens, outbox, public notice page | Every notice path in doc 05 works |
| **N5 — Payments** | Simulator, receipts, refunds, reconciliation | Payment screens | Every edge case in doc 07 §12 has a test |
| **N6 — Court** | Court cases ([06](06-court-cases.md)) | Court screens | |
| **N7 — Time limits and notifications** | Alerts and escalation ([09](09-time-limits-and-notifications.md)) | Notification centre, deadline clocks | |
| **N8 — Rewards** | Citizen rewards ([16](16-citizen-rewards.md)) | Reward screens | |
| **N9 — Dashboards and reports** | Figures per role ([12](12-dashboards-and-reports.md)) | Dashboards, wall mode, management reports | Every figure opens the list it counts |
| **N10 — Demerit points and privacy** | [08](08-demerit-points.md), [10](10-evidence-audit-and-privacy.md) | Screens | |
| **N11 — Migration and go-live** | Move data from the old system | Training | |

## 10. Decisions

| # | Decision | Agreed |
|---|---|---|
| D19-1 | New backend from scratch in `New Backend/`; `Backend/` and `apps/api` untouched | **Yes** (2026-10-23) |
| D19-2 | Express, JavaScript and MongoDB | **Yes** (2026-10-23) |
| D19-3 | JSDoc types checked by the TypeScript compiler (`checkJs`) | **Yes** (2026-10-23) — catches mistakes without writing TypeScript |
| D19-4 | npm, with both new folders as standalone projects outside the pnpm workspace | **Yes** (2026-10-23) — the folder names contain spaces, and they share no code |
| D19-5 | Backend and frontend share no code; the backend sends each user's permissions and each record's `can` | **Yes** (2026-10-23) — one source of truth: the backend |

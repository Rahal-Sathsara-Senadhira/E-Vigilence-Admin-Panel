# 17 — Architecture and technology stack

**Status:** Agreed (2026-10-21) · **Depends on:** [14](14-data-model-and-migration.md), [15](15-build-plan.md) · **Last updated:** 2026-10-21

## 1. Purpose

The product owner decided (2026-10-21) to **build a new frontend and a new backend from
scratch** instead of reworking the current `Backend/` and `Frontend/`. This piece fixes the
architecture, the technology choices and the engineering standards for the new system, so every
teammate builds it the same way.

## 2. What is not changing

- **MongoDB stays.** The mobile app shares the database ([11](11-citizen-app-integration.md)),
  so the new backend uses the same database with the new collections from
  [14](14-data-model-and-migration.md).
- The **agreed documents 00–16** are the specification. The rebuild changes how, not what.
- The **old system keeps running** until go-live; its data is migrated as in 14 §6–7.

## 3. Repository layout

One repository (this one), as a **pnpm workspace** (D17-1):

```
apps/
  api/        New backend (NestJS)
  web/        New admin panel (React)
  pay/        Public payment page + simulator (React, separate build — 07 §5)
packages/
  shared/     Types, zod schemas, enums, state-machine tables, permission matrix
  ui/         Design-system components and tokens (13)
  config/     Shared TypeScript, ESLint and Prettier settings
docs/         These documents
Backend/      Old backend — left in place (teammates still have branches on it); frozen, moved to legacy/ at go-live
Frontend/     Old admin panel — same
```

`packages/shared` is the key: the **permission matrix (01), every state machine (03, 05, 06),
every enum and every request schema** are written once and used by both the API and the
screens, so they can't drift apart.

## 4. Technology choices

| Area | Choice | Why |
|---|---|---|
| Language | **TypeScript (strict)** everywhere | Catches whole classes of bugs; shared types front ↔ back |
| Runtime | Node.js 24 LTS | Already installed; current LTS |
| Backend framework | **NestJS** | Modules match our pieces; guards for the permission matrix; built-in testing and OpenAPI (D17-2) |
| Database access | Mongoose 8 via `@nestjs/mongoose`, MongoDB 7 **replica set** | Transactions (14 M8); team already knows Mongoose |
| Validation | **zod** schemas from `packages/shared` | One schema validates the form and the API |
| API style | REST, `/api/v1`, OpenAPI document generated from code | Easy for the mobile app team and testers |
| Background jobs | **Agenda (MongoDB-backed)** | Time limits, imports, reports, retention without adding Redis (D17-4) |
| Files | S3-compatible storage (Cloudflare R2; MinIO or local disk in development), **direct uploads with signed URLs**, ffmpeg worker | Large videos don't pass through the API |
| Frontend | **React 19 + Vite + TypeScript** | Team knows React; fast builds |
| Routing / data | React Router 7 + **TanStack Query** | Caching, retries, loading states done consistently |
| Forms | react-hook-form + zod | Same schemas as the API |
| UI | Tailwind CSS 4 with the tokens from [13](13-design-system.md); **Radix UI** primitives for menus, dialogs, tabs | Accessible by default; our look, not a library's |
| Charts | Hand-built SVG components on **d3-scale/d3-shape**, following [12](12-dashboards-and-reports.md) §8 | Full control of the validated colour rules |
| Maps | MapLibre GL with OpenStreetMap tiles | No licence fees; station data is already OSM |
| Languages | **English, Sinhala, Tamil** with `i18next` — admin panel English first; the public payment page in all three from day one (D17-5) | Official languages; addressees must understand the page |
| Tests | Vitest (unit), Supertest + mongodb-memory-server (API), **Playwright** (screens, light/dark screenshots) | Same tools on every package |
| Logging | pino, JSON logs with a request id on every line | Traceable problems; no personal data in logs |

## 5. Backend structure

One NestJS **module per piece**, each with the same layout:

```
apps/api/src/modules/<area>/
  <area>.controller.ts   HTTP only: parse, call the service, return
  <area>.service.ts      Rules from the document
  <area>.repository.ts   Database access only
  <area>.schema.ts       Mongoose schema
  <area>.spec.ts         Tests
```

Modules: `auth`, `users`, `stations` (stations, divisions, courts), `offences`, `reports`,
`triage`, `cases`, `dispatch`, `vehicles`, `persons`, `notices`, `payments`, `court`, `rewards`,
`demerit`, `evidence`, `audit`, `notifications`, `timeLimits`, `dashboards`, `appSync`, `settings`.

Cross-cutting rules, enforced in one place:
- **Permission guard** reads the matrix from `packages/shared`; every endpoint declares its
  permission; an endpoint without one fails the build's test.
- **State changes** go through `transition(record, to, actor, reason)` from the shared state
  machine — the only way to change a status.
- **Audit interceptor** writes the audit entry in the same transaction as the change.
- **Scope filter**: station users' queries are limited to their station by the repository layer,
  not by each controller.

## 6. Security

| Area | Rule |
|---|---|
| Sign-in | Short-lived access token (15 min) + **refresh token in an httpOnly, Secure, SameSite cookie**, rotated on use; sign out ends the session server-side (D17-3) |
| Second factor | **Authenticator-app code (TOTP) required for HQ and dev**; optional for station staff at first (D17-3) |
| Passwords | Argon2id; minimum 12 characters; checked against common-password list |
| Sessions | Listed per user; HQ can end any staff session; account changes end sessions |
| Headers | Helmet defaults, strict CORS to our own domains, CSRF protection on cookie routes |
| Rate limits | Sign-in, payment look-up (07 D07-1), public endpoints |
| Secrets | Environment only; `.env.example` lists every variable without values |
| Dependencies | Automated update PRs and a vulnerability check in CI |

## 7. Engineering standards

- **Conventional commits** (`feat:`, `fix:`, `docs:` …), checked by a commit hook. No
  co-author trailers for tools.
- **Branches:** `main` is protected; work on `feat/<phase>-<short-name>` branches; pull request
  with review (15 B2).
- **CI (GitHub Actions)** on every pull request: install, type-check, lint, unit + API tests,
  build; Playwright on `main`.
- **Formatting and linting** enforced by Prettier and ESLint through a pre-commit hook.
- **Every PR** links the document section it implements.

## 8. Local development without Docker

Docker isn't required on developer machines (D17-6):
- `pnpm dev` starts the API, the web app and a **local MongoDB replica set** started by
  `mongodb-memory-server` (persisted to a local folder), or a shared Atlas development cluster
  if `MONGODB_URI` is set.
- Files are stored on local disk in development; R2 in staging and production.
- `pnpm seed` loads demo data: divisions, the 318 verified stations, offences, demo users per
  role, sample reports.

## 9. Effect on the build plan

[15](15-build-plan.md) still applies, with these changes:
- **Phase 0** becomes: create the workspace, shared package, auth with the new roles and TOTP,
  permission guard, state-machine module, audit log, design system and app shell.
- Phases 1–8 build each piece in the new apps; the old `Backend/` and `Frontend/` get bug fixes only.
- **Phase 9** migrates from the old collections to the new ones (14 §6) and switches users from
  the old panel to the new one.

## 10. Decisions

All decisions agreed on 2026-10-21 as recommended (D17-1 adjusted: old code stays in place until go-live).

| # | Decision | Agreed |
|---|---|---|
| D17-1 | Where the new code lives | **This repository, as a pnpm workspace (`apps/`, `packages/`). The old `Backend/` and `Frontend/` stay in place, frozen, until go-live, then move to `legacy/`.** |
| D17-2 | Backend framework | **NestJS + TypeScript** (alternative: Express + TypeScript, lighter but each team member structures it differently). |
| D17-3 | Sign-in security | **Access + rotating refresh token in an httpOnly cookie; TOTP for HQ and dev.** |
| D17-4 | Background jobs | **Agenda on MongoDB** — no Redis to run or pay for. |
| D17-5 | Languages | **English, Sinhala and Tamil supported from the start; payment page translated first.** |
| D17-6 | Local development | **No Docker needed; local replica set via mongodb-memory-server or Atlas dev.** |
| D17-7 | Package manager | **pnpm** (already installed). |

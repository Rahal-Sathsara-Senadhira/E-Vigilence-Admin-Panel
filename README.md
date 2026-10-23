# E-Vigilance

Traffic-enforcement system for Sri Lanka Police: citizen and officer reports, triage, dispatch to
stations, investigation, penalty notices, court cases, payments and citizen rewards.

**How the system must behave is defined in [`docs/`](docs/README.md)** — the agreed specification.
Code follows the documents, not the other way round.

## Repository layout

| Folder                | What                                                                             |
| --------------------- | -------------------------------------------------------------------------------- |
| `apps/api`            | New backend — NestJS, TypeScript, MongoDB                                        |
| `apps/web`            | New admin panel — React, TypeScript, Tailwind                                    |
| `apps/pay`            | Public notice page for addressees — English, Sinhala, Tamil                      |
| `packages/shared`     | Roles, permission matrix, state machines, validation schemas — used by both apps |
| `packages/ui`         | Design-system tokens and components ([docs/13](docs/13-design-system.md))        |
| `docs`                | Specification, pieces 00–17                                                      |
| `Backend`, `Frontend` | The old system — frozen (bug fixes only) until go-live, then moved to `legacy/`  |

The rebuild follows the [build plan](docs/15-build-plan.md). **Phase 0 (foundations)** is in place:
sign-in with two-step codes, roles and permissions, accounts, the hash-chained audit log, and the
app shell in the new design.

## Run it locally

Needs Node.js 24 and pnpm. No Docker.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # then fill in the two secrets and SEED_PASSWORD
pnpm db:local                            # terminal 1: local MongoDB replica set (port 27027)
pnpm seed                                # once: divisions, 318 stations, demo accounts
pnpm dev                                 # terminal 2: API on :4100, admin panel on :5280, public notice page on :5290
```

Open http://localhost:5280. Demo accounts (password = `SEED_PASSWORD`):

| Account                          | Role                                                            |
| -------------------------------- | --------------------------------------------------------------- |
| `hq@evigilance.local`            | HQ Traffic Unit — sets up an authenticator app at first sign-in |
| `dev@evigilance.local`           | Developer — same                                                |
| `oic.kandy@evigilance.local`     | Station OIC, Kandy                                              |
| `officer.kandy@evigilance.local` | Traffic officer, Kandy                                          |
| `oic.galle@evigilance.local`     | Station OIC, Galle                                              |

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test      # API tests run against an in-memory MongoDB (downloads MongoDB 7.0.14 once)
pnpm build
```

The same checks run on every pull request (`.github/workflows/ci.yml`).

## Database migrations

```bash
pnpm migrate              # dry run: lists pending migrations, writes nothing
pnpm migrate --apply      # applies them — back up first (docs/14 §5)
```

## Conventions

- Conventional commit messages (`feat:`, `fix:`, `docs:`, `test:`, `chore:`) — checked by a commit hook
  installed with `pnpm install`.
- Work on a branch, open a pull request, get a review (docs/15 B2).
- If a rule in `docs/` turns out wrong while building, change and agree the document first.

Station data © OpenStreetMap contributors, ODbL 1.0.

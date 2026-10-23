# E-Vigilence — new build: to-do

The working list for `New Backend/` and `New Frontend/`. Plans: [roles](docs/20-roles-v2.md) ·
[backend](docs/19-new-backend-plan.md) · [frontend](docs/18-new-frontend-plan.md).
Business rules: docs 02–17.

`Frontend/`, `Backend/`, `apps/web` and `apps/api` are **not touched**.

**Done means:** the API tests pass, lint and type check are clean, the screens work at every width
(360–1920 px) in both themes, and the docs say what was built.

Legend: `[x]` done · `[ ]` to do · **(you)** needs you, not code.

---

## Setup

- [x] Plans agreed: roles v2, backend, frontend (2026-10-23)
- [x] New MongoDB (Atlas) and Cloudflare R2 details in `New Backend/.env`
- [x] `.gitignore` ignores every `*.env` file (it missed `atlas-credentials (1).env` before)
- [ ] **(you)** Delete `New Backend/atlas-credentials (1).env` once `.env` is confirmed working —
      one copy of a secret is enough
- [ ] **(you)** Atlas → Network Access: allow this computer's IP (and the server's, later)
- [x] `New Backend/.env.example` with variable names only, no values
- [ ] Store every R2 object under the `new e-vigilence/` folder (`R2_PREFIX` setting), so the new
      build never touches the old system's files — setting in place; used when evidence upload
      is built (N2)
- [x] Database name `evigilance_new` on the new Atlas cluster; tests use an in-memory database,
      never Atlas
- [ ] Before go-live: the citizen mobile app's shared database and collections (doc 11) — the new
      cluster is for our development only

## N0 — Foundations

### Backend

- [x] Project: `package.json` (ES modules, Node 24), ESLint, Prettier, `jsconfig.json` (`checkJs`),
      Vitest, scripts `dev`, `start`, `test`, `check`, `seed`
- [x] `config/env.js`: read and check every setting at start-up; refuse to start if one is missing
- [x] `core/errors.js` and the error handler: one error shape, right HTTP status
- [x] `core/logger.js`: JSON logs with a request id
- [x] `core/db/`: connection, `inTransaction`, number counters (`RP-`, `TC-`, `PN-`)
- [x] `app.js` / `server.js`: helmet, JSON limits, CSRF header check, health endpoint, graceful shutdown
- [x] `core/access/`: the 11 roles, permission matrix (doc 20 §5), scope helper, `requirePermission`,
      `publicRoute`, start-up check that every route declares access
- [x] `core/audit/`: audit log with hash chain
- [x] `modules/auth/`: sign in, sign out, refresh cookie rotation, two-step sign-in (set up,
      verify, required for national and division roles), lock-out after failed attempts,
      change password, forced change on first sign-in
- [ ] `modules/users/`: list, create, edit, deactivate, reset password, with "who manages whom"
      (doc 20 §6) and no self-administration (S5)
- [x] Seed: one demo account per role
- [ ] Tests: sign-in flows ✓, roles and guards ✓ (25 tests); still to do: account management rules,
      and one request per role × permission once routes exist

### Frontend

- [x] Project: Vite + React 19, Tailwind 4, ESLint, Prettier, `jsconfig.json` (`checkJs`, `@/`
      paths), Vitest, Playwright; dev server on port 5300 proxying `/api` to 4200
- [x] Folder structure from doc 18 §10, with import-boundary lint rules
- [x] Tokens: colours (light and dark), IBM Plex Sans and Mono, spacing, radius, motion
- [ ] `ui/` first components: Button, Input, Field, Select, Checkbox, Badge, Alert, Spinner, Skeleton
- [x] `lib/`: API client (in-memory access token, refresh, CSRF header), session, permissions, formatting
- [ ] App frame: icon rail, top bar, phone bottom tabs, theme switch, user menu
- [ ] Menus built from the user's permissions
- [x] Screens: sign in, two-step code, set up two-step sign-in, forced password change, change password
- [ ] `/design` page: tokens and components in both themes
- [ ] Playwright: sign in as each role; screenshots at 360, 768, 1280, 1920

## N1 — Reference data

- [ ] Divisions: create, edit, list; stations belong to a division
- [ ] Stations: details, contact, area (map polygon), active/verified; OIC edits contact (doc 20)
- [ ] Offence schedule: seed from Gazette 2054/9 and Act No. 10 of 2019; versions; HQ administrator edits
- [ ] Time limits: versioned settings (doc 09)
- [ ] Audit log: list and filter, scoped by role
- [ ] Screens: accounts, divisions, stations (with map), offence schedule, time limits, audit log
- [ ] `ui/` additions: DataTable, FilterBar, Pagination, EmptyState, Dialog, Sheet, Menu, Tabs, Toast

## N2 — Reports and evidence

- [ ] Reports: record (staff channels), list per role, triage (accept, merge, needs info, reject)
- [ ] Evidence: streamed upload to R2 (`new e-vigilence/` prefix), SHA-256, content check,
      viewing copies, custody record
- [ ] Mobile-app import and status updates back to the app (doc 11)
- [ ] Screens: Inbox, triage split view, report record, new report, evidence viewer, command palette

## N3 — Cases and people

- [ ] Cases: state machine, dispatch (jurisdiction, then nearest), accept and return, assign officer
- [ ] Investigation: notes, statements, evidence review, vehicle trace, driver
- [ ] Vehicles and persons registers, duplicate checks, merge (HQ administrator)
- [ ] Recommend and decide with S1 and S2 (division supervisor when the OIC investigated)
- [ ] HQ supervisor override, reopen, merge cases; division supervisor moves cases between stations
- [ ] Screens: case queues and record (split view, lifecycle bar, deadline clock), vehicle and person records

## N4 — Penalty notices

- [ ] Issue on decision, service by post, not delivered, re-serve
- [ ] Naming the driver, disputes (S8), overdue sweep, reminders, court proposal
- [ ] Withdrawal (HQ supervisor), outbox
- [ ] Public look-up, name the driver, dispute (rate limited)
- [ ] Screens: notice queues and record, outbox; public notice page

## N5 — Payments

- [ ] Decide together how this phase is written (an earlier attempt was stopped)
- [ ] Simulator, recorded receipts (S3), refunds (S4), reconciliation (doc 07)

## N6 — Court cases (doc 06)

- [ ] Court referral, filing, hearings, results; screens

## N7 — Time limits and notifications (doc 09)

- [ ] Alerts and escalation; notification centre; deadline clocks everywhere

## N8 — Citizen rewards (doc 16)

- [ ] Reward rules, points, payout batches (S4); screens

## N9 — Dashboards and reports (doc 12)

- [ ] National, division, station and "My work" dashboards; wall mode
- [ ] Management reports and exports; executive viewer with no personal data

## N10 — Demerit points and privacy (docs 08, 10)

- [ ] Demerit points; data retention; privacy requests

## N11 — Migration and go-live

- [ ] Move data from the old system; switch the mobile app integration to the new backend
- [ ] Training material per role; retire `Frontend/`, `Backend/`, `apps/web`, `apps/api`

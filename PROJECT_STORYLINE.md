# E-Vigilence — Project Storyline

This document describes the story the system tells through its code — the actors, the journey a
violation takes from report to resolution, and the entities involved — followed by the loopholes
found in two audit passes and the fixes applied for each.

Originally written 2026-09-26; updated the same day after the fix pass described below. Where the
intended behavior is still unclear, that's called out explicitly rather than assumed.

## Actors

| Actor | Role value | What the code lets them do |
|---|---|---|
| HQ staff | `hq` | Full access: create/edit/delete violations, manage users (any station), manage police stations, manage regional stations, run reports, change global system settings, dispatch violations to stations (auto or manual). |
| Station admin | `station_admin` | Everything a station officer can do, **plus**: create, edit, and deactivate `station_officer` accounts scoped to their own station (`/api/users`, enforced in `users.service.js`). Cannot touch users at other stations, cannot create another `station_admin` or `hq` account. |
| Station officer | `station_officer` | View their station's dispatch inbox, view violations assigned to their station, update a violation's status/note. No user-management access. |
| Citizen / reporter | *(external)* | Reports violations via a **separate app** (`github.com/Pasan-Liyanage/E-Vigilance-Client`, a citizen PWA + its own Express/Mongoose backend) that **shares this same MongoDB Atlas database** by design — not a separate one, as first assumed (see "Citizen-app integration" below). Citizen accounts live in the same `users` collection as staff accounts, distinguished by `role`. |

The dead `"admin"` role referenced throughout the old authorization code (`requireRole("hq",
"admin")`) has been removed — it was never a valid value in `User.role`'s enum, so those checks
could never match it anyway. Behavior for real accounts is unchanged.

## The intended journey (as implemented today)

0. **A citizen reports a violation** through the public website or mobile app (separate system,
   out of scope for this repo).
1. **The citizen backend pushes it into this system.** `POST /api/violations/ingest`, authenticated
   with a shared `X-Ingest-Key` header (`INGEST_API_KEY` env var) rather than a user login — see
   `middlewares/ingestAuth.js`. HQ can also create a violation manually via
   `POST /api/violations` (`requireRole("hq")`). Both paths run through the same validation,
   duplicate-check, and creation logic (`violations.controller.js#create` → `violations.service.js#create`).
2. **HQ dispatches it to a station** — either automatically to the nearest **active** station
   (`POST /api/violations/:id/dispatch-nearest`) or manually to a specific station
   (`POST /api/violations/:id/dispatch-to/:stationId`, for jurisdiction overrides). Inactive
   stations (`PoliceStation.isActive`) are now excluded from auto-dispatch and rejected by the
   manual path.
3. **The assigned station sees it in their inbox** (`GET /api/dispatches/inbox`,
   `GET /api/violations/assigned/me`), scoped to their own station.
4. **The station works the case** (`PATCH /api/violations/:id/station-update`), choosing from the
   same six statuses (`open`, `pending`, `in_review`, `resolved`, `verified`, `rejected`) that HQ's
   own edit path now respects too — see loophole #4's fix. Every status change is appended to
   `Violation.statusHistory` with who changed it and when.
5. **HQ can also edit the violation** (`PATCH /api/violations/:id`) without clobbering whatever
   status the station set.
6. **Reporting** (`GET /api/reports/violations/summary`, CSV export, saved report runs) is
   attributed to the authenticated caller, not a client-supplied name.
7. **Regional stations and police stations** can now be linked (`PoliceStation.regionalStationId`),
   though the admin panel's station form doesn't yet expose a UI control for it — see "Known
   follow-ups" at the end of this document.

## Data model map

- `User` → optionally belongs to one `PoliceStation` (`stationId`).
- `Violation` → optionally assigned to one `PoliceStation` (`assignedStation`, now also driving
  dashboard station-scoping); carries `statusHistory` (audit trail) and `possibleDuplicateOf`
  (duplicate-flagging output). `reported_by` remains a plain string, not linked to any account —
  reports arrive from the separate citizen system, which owns its own reporter identities.
- `Dispatch` → links one `Violation` to one `PoliceStation`, with its own `status` lifecycle
  (`sent` / `received` / `in_progress` / `resolved`), still separate from `Violation.status` (this
  wasn't one of the identified loopholes, but is worth knowing if you touch this area later).
- `PoliceStation` → now has `isActive`, `code`, `district`, `province`, and `regionalStationId`
  (nullable link to `RegionalStation`) — all previously accepted by the controller but silently
  dropped by the schema.
- `Notification` → `user_id` is still a loose string, not a `User` reference, but access is now
  enforced at the query layer regardless (ownership check, not a schema-level relation).
- `ReportRun` → `createdBy` now comes from the authenticated session.

---

## Citizen-app integration (added 2026-09-27)

The separate citizen-reporting app (`E-Vigilance-Client`, not part of this repo) shares this
Atlas database on purpose, per its own README: *"shares the same MongoDB Atlas database as the
existing admin dashboard, so every report filed here appears in the admin panel immediately."* Its
code even anticipates this repo reading from it directly (`/api/media/:id`'s route comment: *"Public
so <img>/<video> tags (and the admin panel) can load evidence directly"*). But it writes to its own
`reports` collection with its own schema and its own 3-value status (`In Progress`/`Completed`/
`Rejected`) — nothing in this repo ever read it, and the `users` collection it also shares held
citizen accounts (`password`, `role:"user"`) with no filtering keeping them out of staff
user-management.

**⚠️ Note on data loss:** early in this integration work, the database this repo's `.env` pointed
at (a bare Atlas URI with no database name, defaulting to Mongo's `test` database) was wiped at the
user's request, believing it held only this repo's own dev/test data. It's since been confirmed
that database's `reports`/`evidence.files`/`evidence.chunks`/shared `users` collections almost
certainly held the citizen app developer's real local-dev testing data (that project isn't deployed
yet, so not end-user data) — gone, and very likely unrecoverable (Atlas free-tier `M0` clusters,
which this looks like, don't have backups). `.env` now explicitly targets `/evigilence` instead of
the implicit `test` default, which is the correct fix going forward, but doesn't undo the wipe.

**What was built** (chosen over live dual-collection reads specifically so the rest of this
codebase — dispatch, dashboard, audit trail, duplicate detection, reports/CSV export — didn't need
to change at all):

- `db/providers/mongo/models/CitizenReport.js` — a read-mostly Mongoose model pointed at the same
  `reports` collection the citizen app owns.
- `modules/violations/citizenReportSync.js#syncCitizenReports()` — finds `CitizenReport` docs not
  yet mirrored (tracked via `Violation.sourceReportId`, the de-dup key), maps each into an ordinary
  `Violation` via the existing `violations.service.js#create()` (so duplicate-detection and the
  initial audit-trail entry happen for free), and skips/logs individual failures rather than
  aborting the batch. Runs on a 60s background interval (`server.js`) and on demand via
  `POST /api/violations/sync-citizen-reports` (HQ only).
- `utils/violationStatus.js#fromCitizenStatus`/`toCitizenStatus` — the vocabulary bridge between
  the citizen app's 3 statuses and this repo's 6. `syncStatusToCitizenReport()` writes HQ/station
  status changes back onto the citizen's own document (wired into both
  `violations.controller.js#update` and `dispatch.service.js#stationUpdateViolationForStation`), so
  the citizen sees progress without either repo calling the other's API.
- `Violation.location.lat`/`.lng` are no longer schema-required (citizen reports can have no GPS
  fix) — the HTTP create route's own validation still requires one for manually-created violations;
  a GPS-less synced report just can't use auto-dispatch and needs the existing manual
  `dispatch-to/:stationId` path instead, which is correct, not a gap.
- `users.mongo.repo.js#findMany` now always filters to staff roles (`hq`/`station_admin`/
  `station_officer`), un-overridable even via `?role=user`; `users.service.js#getUserById`/
  `updateUser`/`deleteUser` reject (404) if the target isn't a staff account. Login was already
  safe by construction — `verifyPassword` rejects a citizen account's `password` field, which isn't
  `password_hash`.

**Prerequisite, not yet fully true:** both apps' `MONGO_URI` must point at the exact same cluster
*and* the same explicit database name. This repo's now does (`/evigilence`). The citizen app isn't
deployed yet, so whoever runs it locally needs to match that — nothing above works until they do.

---

## Business-logic loopholes (originally 12, all fixed)

### 1. ~~No ingestion path from the citizen system~~ — Superseded, see "Citizen-app integration" below
This was fixed once already (`POST /api/violations/ingest`, an `X-Ingest-Key`-authenticated push
endpoint, still present and still usable as a fallback for any *other* future integration). Then it
turned out the real architecture was never a push API — the citizen app's own README and code
comments confirm it deliberately **shares this database** and expects direct reads. The actual fix
is the citizen-report sync described below; the ingest endpoint was solving a problem that didn't
need solving this way, but doesn't hurt anything left in place.

### 2. ~~Role model promised three tiers, enforced one~~ — Fixed
Removed the unreachable `"admin"` role from every check. `station_admin` now has real, distinct
scope: managing `station_officer` accounts within its own station
(`users.service.js` — `listUsers`/`createUser`/`updateUser`/`deleteUser`/`getUserById` all enforce
this via `assertOwnStationOfficer`).

### 3. ~~Dispatch was fully automatic, no override or capacity check~~ — Fixed
`PoliceStation.isActive` is now a real, persisted field; `dispatchNearestStationForViolation`
excludes inactive stations from its `$near` query. Added
`POST /api/violations/:id/dispatch-to/:stationId` (`dispatch.service.js#dispatchToStation`) for
HQ to manually route to a specific (active) station.

### 4. ~~Violation status meant different things depending on who touched it~~ — Fixed
`Backend/src/utils/violationStatus.js` is now the single source of truth for the six-value status
vocabulary and its aliases (`under_review→in_review`, `closed→resolved`). `violations.validation.js`,
`violations.controller.js`, and `dispatch.service.js` all import it — the HQ path no longer
collapses `pending`/`verified`/`rejected`.

### 5. ~~Regional stations and police stations were unrelated~~ — Fixed (backend)
Added `PoliceStation.regionalStationId` (nullable ref to `RegionalStation`) and wired it through
`stations.controller.js#create`. **Follow-up:** the station create/edit form in the frontend
doesn't have a region picker yet — see "Known follow-ups" below.

### 6. ~~Report-run authorship was spoofable~~ — Fixed
`reports.controller.js#createViolationsReportRun` now attributes `createdBy` to
`req.user.name || req.user.email || req.user.id`, never a client-supplied value.

### 7. ~~No audit trail on violations~~ — Fixed
Added `Violation.statusHistory` (status, note, who, role, when). Both update paths — HQ's
`PATCH /api/violations/:id` and the station's `PATCH /api/violations/:id/station-update` — append
to it whenever status changes; creation logs the initial entry too.

### 8. ~~No duplicate-report detection~~ — Fixed (flag-only, as decided)
`violations.mongo.repo.js#findPossibleDuplicates` runs a coarse same-type + ~150m bounding box +
24h window check on every create. Matches populate `Violation.possibleDuplicateOf`; the response
includes `duplicateWarning: true` when any are found. Creation is never blocked.

### 9. ~~Dashboard had no station-level data isolation~~ — Fixed
`dashboard.service.js#getDashboard` now filters every query (`baseFilter`, recent violations,
system-wide totals) by `assignedStation` when the caller is `station_admin`/`station_officer`; `hq`
keeps the global view. `latestReportRuns` (an hq-wide concept) is omitted entirely for station
roles.

### 10. ~~Notifications were readable via a client-supplied `user_id`~~ — Fixed
`notifications.controller.js` now pins every action to `req.user.id` unless the caller is `hq`
(who may still address/inspect another user's notifications intentionally).
`markRead`/`remove` add an ownership filter at the query layer, so an unauthorized attempt reads as
a 404 rather than leaking existence.

### 11. ~~A police station's "active" flag was silently dropped~~ — Fixed
`PoliceStation` schema now defines `isActive`, `code`, `district`, `province` — the fields
`stations.controller.js` was already sending. This is also what made loophole #3's fix possible.

### 12. ~~Validated input didn't match what actually got saved~~ — Fixed
Same root cause as #4 — now that `violations.controller.js#create`'s `normalizeStatus` call shares
the exact allowed-value set `violations.validation.js` validates against, there's no longer a gap
between what passes validation and what gets persisted.

---

## Security loopholes found in an earlier pass (not written down until now — also fixed)

**A1. Regional Stations routes had zero authentication.** Any unauthenticated caller could create,
bulk-upsert, edit, or delete regional stations. Fixed: `requireAuth` on the whole router,
`requireRole("hq")` on every mutating route.

**A2. No rate limiting on login.** Fixed: `express-rate-limit`, 10 attempts / 15 min per IP on
`POST /api/auth/login`.

**A3. No security headers.** Fixed: `app.use(helmet())`.

**A4. JWT was kept in `localStorage`, readable by any XSS.** Fixed: the session token is now an
httpOnly, `sameSite: "lax"` cookie set by `POST /api/auth/login` and cleared by the new
`POST /api/auth/logout`; `requireAuth`/`optionalAuth` read it from the cookie (falling back to a
`Bearer` header for non-browser clients). The frontend no longer stores or sends a token at all —
only the non-sensitive user profile stays in `localStorage` for synchronous route-guard checks; a
401 from any API call clears that local state and bounces to `/login`, self-healing a stale
"logged in" flag if the cookie expires.

**A5. Seed admin password was a bare literal in source.** Fixed: `seedAdminUser.js` reads
`SEED_ADMIN_PASSWORD` from the environment, warning loudly if it falls back to the old default.

**A6. Evidence uploads allowed up to 500MB per video / 500MB total.** Reduced to 100MB per file to
shrink the storage-exhaustion surface.

**Also found and fixed while implementing the above:** the generic
`GET/PUT /api/settings/:key` endpoints had no role restriction at all, meaning any authenticated
user — including a station officer — could `PUT /api/settings/system` directly and bypass the
`requireRole("hq")` gate that `PATCH /api/settings/system` deliberately enforces. Both generic
routes are now `requireRole("hq")` as well.

---

## Known follow-ups (not loopholes exactly, but worth tracking)

- **No region picker in the station form.** The backend supports linking a `PoliceStation` to a
  `RegionalStation` (loophole #5), but the frontend create/edit form for police stations hasn't
  been updated with a region dropdown yet.
- **No automated test suite.** Everything above was verified by manual/exploratory testing against
  a running instance — there's still no Jest/Vitest setup in this repo to catch regressions.
- **Dispatch.status vs Violation.status remain two separate lifecycles.** Not one of the original
  12 loopholes, but noticed while touching `dispatch.service.js` — worth a look if dispatch
  tracking ever needs to reflect violation resolution state.
- **The citizen app must be pointed at the same `evigilence` database before the sync does
  anything.** It isn't deployed yet, so this just needs confirming once someone runs it.
- **No UI indicator that a violation came from the citizen app.** `Violation.sourceReportId` is
  there if a "Source: Citizen App" badge or filter is wanted later.
- **Duplicate-detection window is per-report, not cross-checked against the citizen app's own
  in-app duplicate handling (if any).** Not investigated — out of scope since it's the other repo.

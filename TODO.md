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

- [ ] **(you)** Name the custodian and backup of the main administrator account (docs/21 §4.2)

- [x] Plans agreed: roles v2, backend, frontend (2026-10-23)
- [x] New MongoDB (Atlas) and Cloudflare R2 details in `New Backend/.env`
- [x] `.gitignore` ignores every `*.env` file (it missed `atlas-credentials (1).env` before)
- [ ] **(you)** Delete `New Backend/atlas-credentials (1).env` once `.env` is confirmed working —
      one copy of a secret is enough
- [ ] **(you)** Atlas → Network Access: allow this computer's IP (and the server's, later)
- [x] `New Backend/.env.example` with variable names only, no values
- [x] Store every R2 object under the `new e-vigilence/` folder (`R2_PREFIX` setting), so the new
      build never touches the old system's files — checked live: upload, read and delete
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
- [x] One-time set-up command for the main administrator account at go-live (docs/21 §4.4):
      refuses to run if an administrator exists
- [x] `modules/users/`: list, create, edit, deactivate, reset password, with "who manages whom"
      (doc 20 §6) and no self-administration (S5)
- [x] Seed: one demo account per role
- [ ] Tests: sign-in ✓, roles and guards ✓, account management ✓ (41 tests); still to do: one
      request per role × permission once each module's routes exist

### Frontend

- [x] Project: Vite + React 19, Tailwind 4, ESLint, Prettier, `jsconfig.json` (`checkJs`, `@/`
      paths), Vitest, Playwright; dev server on port 5300 proxying `/api` to 4200
- [x] Folder structure from doc 18 §10, with import-boundary lint rules
- [x] Tokens: colours (light and dark), IBM Plex Sans and Mono, spacing, radius, motion
- [ ] `ui/` first components: Button ✓, Input ✓, Field ✓, Badge ✓, Alert ✓, Spinner ✓, Avatar ✓,
      Dialog ✓, Sheet ✓, Menu ✓, Tooltip ✓, Page/Panel ✓, Select ✓, Textarea ✓, Skeleton ✓, Table ✓,
      Pagination ✓, EmptyState ✓; still to do: Checkbox
- [x] `lib/`: API client (in-memory access token, refresh, CSRF header), session, permissions, formatting
- [x] App frame: icon rail, top bar, phone bottom tabs, theme switch, user menu
- [x] Menus built from the user's permissions; Ctrl+K command palette; "My account" page
      (password, signed-in devices, sign out everywhere)
- [x] Screens: sign in, two-step code, set up two-step sign-in, forced password change, change password
- [ ] `/design` page: tokens and components in both themes
- [ ] Playwright: sign in as each role; screenshots at 360, 768, 1280, 1920

## N1 — Reference data

- [x] Accounts screens: list with search and filters, create, edit, reset password, reset two-step
      sign-in, unlock, deactivate and reactivate (moved up from N1; done in N0)

- [x] Divisions: create, edit, list; stations belong to a division
- [x] Import of the 44 territorial divisions (Performance Report 2024) and 318 stations from
      OpenStreetMap (ODbL); imported stations start unverified with a suggested division
- [x] Stations: details, contact, area (GeoJSON upload), verify, deactivate (not while staffed);
      OIC and division supervisor edit contact (doc 20)
- [ ] **(you / HQ)** Verify the 316 imported stations — confirm each division and map pin
- [ ] Station areas: draw on the map (upload only for now)
- [ ] Production map tiles: OpenStreetMap's own tile servers are for light use only; choose a
      tile provider (or self-host) before go-live
- [x] Offence schedule: 30 offences from Gazette 2054/9 and Act No. 10 of 2019; versions; HQ
      administrator edits; public copy for the mobile app republished on every change
- [ ] **(you / HQ legal)** Confirm the offence schedule and fines before go-live
- [x] Time limits: all 28 limits from doc 09, versioned; a change applies only to items that
      start after it (`limitAt`, for later modules)
- [x] Audit log: list and filter, scoped by area (entries record their stations and divisions);
      integrity check for national roles
- [x] Screens: accounts, divisions, stations, offence schedule, time limits, audit log
- [x] Map on the station screens (MapLibre, loaded only on pages with a map)
- [ ] Split the main bundle by page (740 kB now; the map is already separate)
- [ ] `ui/` additions: Table ✓, Pagination ✓, EmptyState ✓, Dialog ✓, Sheet ✓, Menu ✓,
      ReasonDialog ✓; still to do: Tabs component, Toast

## N2 — Reports and evidence

- [x] Reports: record (HQ: WhatsApp, phone; station: phone, walk-in, officer), lists per role,
      triage (accept, merge and undo, ask the reporter and record the reply, reject, reconsider
      within 30 days, change priority), 15-minute triage lock, possible duplicates
- [x] Station reports open the station's case at once; an officer's own observation needs a
      second officer or the OIC
- [x] Evidence: streamed upload to R2 (`new e-vigilence/` prefix), SHA-256, file-type check by
      content, size limits, custody record, original download only with a reason (audited)
- [x] Screens: Inbox (queues, split view on laptops), report record, Reports list, new report,
      evidence strip and viewer
- [x] Demo reports: `npm run seed:reports`
- [x] Mobile-app import (doc 11): every minute, each app report once (by the app's id and by
      device + `clientReportId`); evidence copied into R2 from allowed HTTPS hosts only; invalid
      reports and suspended accounts refused with the reason the citizen sees; flags for triage
      (free-text offence, unreadable plate, gallery files, failed downloads); replies from
      `report_replies`; updates to `report_updates` (and the old app's status label)
- [x] Demo app reports: `npm run seed:app-reports`
- [ ] **(you / app team)** Give us the app's media host names for `APP_MEDIA_ALLOWED_HOSTS`
      (required in production) and confirm the field names in doc 11 §4 match the app
- [ ] Import status for the system administrator (last run, skipped documents)
- [ ] Viewing copies: compressed video and stripped photo metadata (the viewer shows the
      original for now)
- [x] Sweep (every 15 min): reject as "no response" when the reporter hasn't answered within the
      limit in force when asked (7 days); the report shows the deadline; the app is told
- [x] Reporter abuse (docs/02 §10): 3 false or abusive rejections within 90 days (both
      settings) flag a mobile-app reporter; triage sees the warning and the count; HQ supervisors
      suspend or lift with a reason (new permission `reporters.suspend`, doc 20); the app reads
      `reward_accounts`; the import refuses suspended accounts
- [ ] Screen listing flagged and suspended reporters (the API exists: `GET /reporters`)
- [ ] Abuse counting for phone and WhatsApp reporters (only app accounts are counted now)
- [x] Ctrl+K: find a report by number, plate (any spelling) or place, within the user's scope
- [ ] Ctrl+K: case and notice numbers (with N3, N4)

## N3 — Cases and people

- [x] Cases (slice 1): the eight states of doc 03; dispatch on acceptance (verified station whose
      area contains the place — smallest wins, flagged — else the nearest verified station; none →
      "not dispatched" for HQ); HQ manual dispatch with a reason (stations nearest first);
      re-dispatch; accept (acceptor investigates) and return before work (two returns →
      disputed: HQ chooses, no further return); investigating officer (OIC assigns; officer
      inactive or moved → "needs an officer"); notes (first officer/OIC note starts the work, C2);
      deadlines fixed at each step (accept 24 h / P1 2 h, start work, assign officer, recommend);
      reports follow their case; stations with active cases can't be deactivated
- [x] Screens: Inbox with case queues (not dispatched, returned, to accept, needs an officer, my
      cases), Cases list, case record (lifecycle bar, deadline clock, dispatch dialog, officer,
      notes, dispatches, history)
- [ ] Cases: division supervisor moves cases between stations in the division (docs/03 §5.2)
- [ ] Alerts when deadlines pass (with N7 notifications)
- [x] Investigation (slice 2): vehicle trace with DMT reference (owner on the offence date, V4;
      ownership added, never overwritten, V3; reuse a trace within 6 months — a setting — V2),
      driver and how identified, evidence review checklist (a "no" needs a note), statements with
      an attached scan, case evidence, flags (suspected false plate, reported stolen with date)
- [x] Person and vehicle registers: search before create (NIC, licence, business registration
      no.), duplicates refused with the existing record offered; people visible to HQ
      supervisors, the auditor and the station handling their cases (officers: assigned cases
      only), every opening logged, identifiers masked in searches; corrections with a reason
- [x] Screens: investigation panel on the case, person picker, person page, vehicle page
- [ ] Persons merge (HQ administrator, P2); special plates with HQ approval (D04-5)
- [ ] Repeat-offender banner (needs outcomes, slice 3)
- [x] Recommend (slice 3): penalty notice, court referral, warning, no further action, each with
      its checks (evidence reviewed, offences confirmed or corrected, addressee with address,
      fineable offences for a notice, minor and no enforcement in 12 months for a warning,
      prosecution summary for court, reason for NFA; not to the owner of a false-plated or
      stolen vehicle); the case lists what each outcome still needs
- [x] Decide with S1 (never the recommender) and S2 (division supervisor when the OIC
      investigated; HQ supervisor when the station has no division): approve, change with a
      reason, send back; 3 days to decide; "To decide" queue; NFA closes the case; facts locked
      after the decision; mobile-app reporters told "action taken" / "closed — no action"
- [x] HQ: override a decision, reopen a closed case, merge two undecided cases (reports and
      work move); repeat-offender banner (3 enforcement outcomes in 12 months)
- [ ] Division supervisor moves cases between stations (docs/03 §5.2)
- [ ] Outcomes carried out — notices, warnings, court (N4, N6); C4 automatic close when they finish
- [ ] Screens: case queues and record (split view, lifecycle bar, deadline clock), vehicle and person records

## N4 — Penalty notices

- [x] Issue on decision (slice 1): penalty notice (PN-) with offences and fines copied from the
      schedule, or warning letter (WL-); post by 3 days; posting → deemed served after 3 days,
      14 days to respond, SMS without details; returned mail → service failed → re-serve at a new
      address (also corrected on the person)
- [x] Overdue sweep (every 15 min): reminder (post + SMS) and 7 more days, then court proposed;
      the OIC confirms the referral
- [x] Withdrawal (HQ supervisor) and on HQ override; the case closes when its outcome ends
      (warning letter posted, notice withdrawn) — docs/03 C4
- [x] Outbox of letters and SMS (SMS waits for the gateway, N7)
- [x] Screens: notice queues in the Inbox (to post, service failed, court proposals), Penalty
      notices list and outbox, notice record, printable A4 notice, notices on the case
- [x] Naming the driver (slice 2): the owner, once, before the due date, with NIC or licence
      and address; the station accepts (driver found or added to the register, owner's notice
      transferred, new notice to the driver, case records the driver) or rejects (owner's notice
      continues); a named driver can't name someone else
- [x] Disputes: once; reviewed within 7 days by someone who didn't decide or serve it (S8);
      upheld → withdrawn and the case decided again; rejected → 7 more days (a setting), then court
- [x] Staff record responses received at the counter; Inbox queues "Named drivers", "Disputes"
- [x] Public page `/notice` (no sign-in): look up with the notice number and plate (any
      spelling), masked name and no address, name the driver or dispute with a declaration;
      rate limited per address (20 look-ups / 15 min, 5 responses / hour)
- [ ] Rate limits in memory: move to MongoDB or Redis before running more than one API process

## N5 — Payments

- [x] Approach agreed: simulator only (no real provider, no card data, TEST MODE everywhere)
- [x] Provider interface + simulator: start, signed confirmation (HMAC, reference once,
      amount checked), refund; outcomes success / declined / cancel / bank delay (D07-4)
- [x] Online payment from /notice: notice number + addressee's NIC or business registration
      number, 5 failed tries per 10 minutes (D07-1); receipt page
- [x] Paid: notice paid, case closed, open dispute closed by payment (D07-6), pending
      nomination set aside, SMS receipt queued; double payment or withdrawn notice refunded
      automatically and flagged; bank delays confirmed by the sweep; pending > 24 h failed
- [x] Recorded receipts (cash agent, post office, bank): full amount, photo of the receipt,
      reviewed by finance — never the recorder (S3); reversal unpays the notice
- [x] Refunds: a paid notice withdrawn (HQ, override) → refund due → finance approves (S4)
- [x] Screens: Payments page and record (scan viewer, review, refund), Inbox queues, record a
      receipt on the notice, simulator page
- [ ] Reconciliation report (daily) and totals for dashboards (docs/07 §10)
- [ ] Receipt scans as PDF; S4 by account id rather than name
- [ ] **(you / HQ)** GovPay agreement with ICTA and LankaPay before real payments

## Deployment

Guide: [docs/22](docs/22-deployment.md).

- [x] Backend ready for Railway: `railway.json` (start, health check, one instance), scripts
      work without a `.env` file, client address behind proxies (`TRUST_PROXY_HOPS`), refuses
      to start without R2 or the payment secret, direct calls only from `WEB_ORIGIN`
- [x] Frontend ready for Vercel: `vercel.json` (`/api` forwarded to Railway, page addresses to
      the app, asset caching, security headers), optional direct uploads (`VITE_UPLOAD_ORIGIN`)
- [ ] **(you)** Railway: project, root `New Backend`, variables with **new** production secrets,
      domain; Atlas network access
- [ ] **(you)** Vercel: project, root `New Frontend`, Railway domain in `vercel.json`; then
      `WEB_ORIGIN` on Railway
- [ ] **(you)** First-time data: reference import and the main administrator (docs/22 §1)
- [ ] Test a 10 MB video upload through Vercel; if it fails, set `VITE_UPLOAD_ORIGIN`

## N6 — Court cases (doc 06)

- [x] Courts (Magistrate's Courts) managed by HQ, district chosen from the 25 districts; each
      station's default court (D06-1)
- [x] Court cases opened from a "court" decision and from confirmed referrals of unpaid or
      unserved notices
- [x] Prepare → approve filing (never the preparer) → file (notice marked court filed) →
      hearings → verdict → confirm (never the recorder) → case closed
- [x] Paying the notice before filing withdraws the court case; after filing it does not
- [x] Guilty plea gives a conviction; postponements beyond `court.max_postponements` flag HQ;
      withdrawal with a reason; appeals and their results
- [x] Evidence bundle for court: every item with its SHA-256 fingerprint, printable, logged
- [x] Screens: Court page and record, Inbox queues, court panel on the case, Courts settings,
      default court on the station page
- [ ] Hearing reminders (N7); demerit points and reward effects of verdicts (N8, N10)

## N7 — Time limits and notifications (doc 09)

- [x] In-app notifications: the bell with the unread count (every minute), the Notifications
      page, mark read / all read; kept 90 days (D09-6); each links to its item (N1)
- [x] Event notifications from the audit log (§5.2): case sent to your station, assigned to
      you, waiting for your decision, sent back, returned to HQ, dispute received, court
      referral proposed, court case to prepare / to approve / verdict to confirm, receipt to
      review; never to the person who did it
- [x] Grouping: more than 10 similar alerts in an hour become one summary (D09-7)
- [x] Deadline sweep (every 5 min) over every limit in §4 with a stored or computed deadline:
      once per breach to the responsible person and supervisor; at twice the limit to HQ and
      the division supervisor (T4); resolved by itself when the item moves on
- [x] Overdue page: open breaches in your area, by kind, longest overdue first (T3)
- [x] Hearing reminders (3 days before); verified stations without an active OIC → HQ admins,
      at once and daily
- [x] SMS gateway interface + simulator: queued SMS sent every 30 s with a reference; refused
      numbers marked failed and shown in the outbox; one sender name (N5)
- [ ] Daily email digest for staff (D09-3) — needs an email provider
- [ ] Citizen push / in-app messages (§5.3) — with the mobile app (doc 11)
- [ ] **(you / HQ)** SMS provider agreement (e.g. Dialog, Mobitel or a GovSMS service)

## N8 — Citizen rewards (doc 16)

- [x] Reward rules, versioned and audited (HQ administrators): points by severity and per
      offence, warning points, conversion, minimum payout, monthly cap, daily earning limit
- [x] Points on the decision: the case's highest offence; lead report 100%, later report with
      evidence 25%, duplicate 0; warnings 5 points confirmed at once
- [x] Confirmed when the notice is paid or the court convicts; back to pending if a receipt is
      reversed; reversed on withdrawal, upheld dispute, acquittal, override or reopening;
      points already paid out recovered from future rewards
- [x] Eligibility and fraud checks: verified phone and NIC, 18+, not police staff (phone),
      self-report (NIC or phone of owner/driver), daily limit, suspended account, same
      address (held), 3+ reports on one plate in 90 days (held); fabricated evidence cancels
      pending points and freezes payouts, a second time ends rewards
- [x] HQ supervisors (`rewards.review`, added to docs/20) hold, release and reverse rewards
      and freeze, restore or end an account's rewards — always with a reason, audited
- [x] Balance and latest lines kept in `reward_accounts` for the app; a plain reward line on
      each report; points expire after 12 months unpaid, with a warning 30 days before
- [x] Screens: Rewards (held for review first), a reward, a citizen's rewards, the rules
- [x] Payout requests read from the app's `payout_requests` (only the last digits of the
      account kept); available points set aside at once, recoveries netted first, then the
      points closest to expiring, within the monthly cap; below the minimum or frozen → rejected
      with a plain reason; state written back in `reward_accounts.payouts`
- [x] Weekly batches: one finance officer prepares, another approves (never the preparer);
      approval pays through the payout simulator; failed → retry or reject (points return);
      an approved batch interrupted part-way is finished by the payout job
- [x] A reward reversed while its payout waits shrinks the payout (or rejects it below the
      minimum); freezing an account rejects its open payouts
- [x] Requests waiting over 7 days alert finance (`rewards.payout_batch`, HQ at twice)
- [x] Screens: Payouts (requests, batches, totals by month), a batch
- [ ] SMS to the citizen when a payout fails (D09-4) — the outbox is notice-only today
- [ ] Totals by district and offence (§9) — with the N9 dashboards
- [ ] **(you / HQ)** legal authority and a funding source before real payouts (§12)
- [ ] Police-staff check by NIC once staff accounts record it (by phone today)
- [ ] Conflict of interest (the reporter's relative handled the case) — needs family links

## N9 — Dashboards and reports (doc 12)

- [x] One dashboard per role: Command centre (HQ, executive; a division supervisor's own
      division), My station (OIC), My work (officers: their cases; clerks: notices and court
      preparation) — needs attention first, then this period, then charts and lists
- [x] Every figure computed from the records with one written definition (shown on hover);
      "needs attention" tiles open the list they count; change vs the previous period
- [x] Filters in the URL: period (today, 7/30 days, this/last month, custom up to 24 months,
      Sri Lanka time), division and station (HQ), channel, priority; cached 60 seconds
- [x] Charts in the validated palette (re-checked against this panel's surfaces): reports by
      channel, triage outcome, case pipeline, top offences, cases per officer; station table
      sorted by overdue work, no ranking colours; "View as table" on every chart
- [x] Online (simulator) money shown separately as TEST, never in collection (D12-6)
- [ ] Date filters on the lists, so "this period" figures open their exact list too (D3)
- [ ] Wall mode; system health page (§4.5); integrity/audit alert tile
- [ ] Map of open cases — after the map tile provider is chosen
- [ ] Management reports (PDF + CSV, scheduled, report runs) — slice 2
- [ ] Load test: dashboard under 1 s at 1 million reports (§9)

## N10 — Demerit points and privacy (docs 08, 10)

- [ ] Demerit points; data retention; privacy requests

## N11 — Migration and go-live

- [ ] Move data from the old system; switch the mobile app integration to the new backend
- [ ] Training material per role; retire `Frontend/`, `Backend/`, `apps/web`, `apps/api`

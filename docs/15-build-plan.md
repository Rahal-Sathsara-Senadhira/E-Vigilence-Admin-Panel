# 15 — Build plan

**Status:** Agreed (2026-10-21) · **Depends on:** all pieces · **Last updated:** 2026-10-21

> **Rebuild:** on 2026-10-21 the product owner decided to build a new frontend and backend from
> scratch. The phases below still apply; [17](17-architecture-and-stack.md) §9 describes how
> phase 0 and phase 9 change.

## 1. Purpose

Pieces 00–16 say *what* the system does. This piece says **in what order it is built**, what each
step delivers, and how we know a step is finished. Each phase ends with working, tested software
that could be shown to HQ — no phase leaves the system half-broken.

## 2. How we build

- B1. **One phase at a time, in order.** A phase starts only when the previous one meets its
  "done when" list (§4).
- B2. **Small pull requests** (one feature each), reviewed by a second team member before merge;
  `main` always runs.
- B3. **Docs first:** if building shows a rule is wrong or missing, the document is changed and
  agreed **before** the code (README process).
- B4. **Tests with every feature:** unit tests for rules and state transitions; end-to-end API
  tests against an in-memory database (the pattern already used for the stations and violations
  work); a screenshot check of each new screen in light and dark mode.
- B5. **Feature switches** for anything visible to the public or the mobile app, so a phase can
  be merged before it is switched on.
- B6. **No real money, no real messages** until go-live: payment simulator, and SMS/post written
  to an outbox screen instead of sent (D15-3).
- B7. Each feature's document is updated to **Built** with links to its code and tests.

## 3. Environments

| Environment | Data | Used for |
|---|---|---|
| Local | Seeded demo data (stations, divisions, offences, sample reports) | Development |
| Staging | A **masked copy** of production (names, NIC, phones replaced) | Migration rehearsals, HQ demos |
| Production | Real | After go-live (phase 9) |

The mobile app team gets its own staging database copy to test the contract ([11](11-citizen-app-integration.md)).

## 4. Phases

### Phase 0 — Foundations
Docs: [01](01-roles-and-permissions.md), [10](10-evidence-audit-and-privacy.md) §4, [13](13-design-system.md), [14](14-data-model-and-migration.md) §3, §5
- Fix the roles: add `station_oic`; remove business permissions from `dev`; stop HQ creating dev
  accounts; permission checks from one matrix (01 P1–P5).
- Migration runner (`migrations` collection, dry run, idempotent steps).
- State-machine module: enums + transition tables, used by every record type.
- Single **audit log** with hash chain and the daily chain check.
- Settings for every time limit ([09](09-time-limits-and-notifications.md)).
- Design system: new colour tokens, navy sidebar, top bar, components ([13](13-design-system.md)), light and dark.

**Done when:** every existing screen works in the new design; permission tests cover the whole
matrix in 01; the audit chain check passes and detects a tampered entry in a test.

**Status (2026-10-21) — built.**

| Item | State | Where |
|---|---|---|
| Workspace, CI, lint, formatting | Built | `package.json`, `.github/workflows/ci.yml` |
| Roles and permission matrix (P1–P5, S5, S6, D01-2) | Built, tested | `packages/shared/src/permissions.ts`, `apps/api/src/modules/users` |
| Sign-in: Argon2id, rotating refresh cookie, TOTP for HQ/dev, lock-out | Built, tested | `apps/api/src/modules/auth` |
| State-machine module (case machine as first user) | Built, tested | `packages/shared/src/stateMachine.ts` |
| Audit log with hash chain, chain check (daily timer until phase 5) | Built, tested | `apps/api/src/modules/audit` |
| Design system and app shell, light and dark | Built | `packages/ui`, `apps/web` |
| Migration runner (dry run by default, idempotent, recorded, audited; first migration creates indexes) | Built, tested | `apps/api/src/migrations`, `pnpm migrate [--apply]` |
| Time-limit settings: all 30 limits of 09 §4, HQ-only changes with a reason, versioned so a change applies only to work started after it (T2) | Built, tested | `packages/shared/src/timeLimits.ts`, `apps/api/src/modules/settings`, Time limits page |
| Commit-message hook (conventional commits) | Built | `.husky/commit-msg`, `commitlint.config.mjs` |

"Every existing screen" is read for the rebuild as: every phase-0 screen (sign-in, accounts,
stations, audit log, system health) works in the new design — the old panel is not migrated
screen by screen ([17](17-architecture-and-stack.md)). Tests: 22 shared + 41 API.

### Phase 1 — Reports and triage
Docs: [02](02-reports-and-triage.md), [11](11-citizen-app-integration.md), [10](10-evidence-audit-and-privacy.md) §3
- `incident_reports`, `evidence_items`, `custody_events`; originals kept from now on.
- Triage queue with locks, checklist, accept / merge / needs-info / reject, priority.
- Mobile app contract: `clientReportId`, `offenceIds`, `report_updates`, `report_replies`,
  `offence_schedule_public`; import rejects invalid and suspended-account reports.
- Station-originated and walk-in/hotline reports through the same queue.

**Done when:** a report from each channel goes through every triage outcome in an e2e test; the
mobile app team confirms the contract on staging.

**Status (2026-10-21) — built; waiting for the mobile app team.**

| Slice | State | Where |
|---|---|---|
| Offence schedule: versioned (D14-8), seeded from Gazette 2054/9 and Act No. 10 of 2019 (*to be confirmed by HQ legal*), public copy for the app | Built, tested | `apps/api/src/modules/offences`, migration 0002 |
| Reports and triage: recording by HQ and stations, queue, lock, accept / merge / undo / needs info / reply / reject / reconsider, priority, matching cases, station review, second-officer acceptance (S1), reporter abuse flagging, no-response expiry | Built, tested (20 tests) | `apps/api/src/modules/reports`, `apps/api/src/modules/cases` |
| Evidence: streamed uploads checked by content, originals kept with SHA-256, compressed viewing copies (ffmpeg), chain of custody, HQ-only original access with a reason, unclaimed and stuck-processing limits; local disk or private R2 | Built, tested (10 tests, incl. real video compression) | `apps/api/src/modules/evidence` |
| Mobile app import: `reports` → reports (once, by source id), evidence downloaded into our storage (HTTPS allow-listed hosts only), old `issueType` matched to the schedule, invalid reports rejected on import, `report_updates` for every milestone (plus the old status field until the app switches), `report_replies`, suspension via `reward_accounts` | Built, tested (7 tests) | `apps/api/src/modules/app-sync`, `reports/report-updates.service.ts` |
| Admin panel: triage queue and tabs, report detail with triage lock, checklist, matching cases and all decisions, evidence gallery with custody log, record a report with uploads, offence schedule with versions | Built | `apps/web/src/pages/reports`, `OffencesPage.tsx` |

Remaining for "done when": the mobile app team confirms the contract (§11 below) on staging.

### Phase 2 — Cases, dispatch and investigation
Docs: [03](03-cases-and-dispatch.md), [04](04-investigation-vehicles-and-people.md)
- `cases` with the state machine; dispatch rewired to cases (built dispatch logic kept).
- Investigating officer assignment; OIC queues.
- `vehicles` and `persons` registers with duplicate search, ownership history, HQ merge.
- Recommendation and decision with four-eyes rules.

**Done when:** a case can go open → closed through every path in 03 §4, including return and
send-back; refused transitions are tested.

**Status (2026-10-21) — built.**

| Item | State | Where |
|---|---|---|
| Dispatch: jurisdiction (smallest area, overlaps flagged), then nearest; skips stations that returned it; warnings; manual with a reason; dispatched in the same step as triage accept | Built, tested | `apps/api/src/modules/cases/dispatcher.ts` |
| Accept / return (before work only), two returns → disputed jurisdiction, no return after HQ's ruling | Built, tested | `case-workflow.service.ts` |
| Investigating officer: the accepting officer; OIC/HQ reassign within the station; released to the OIC's queue when the officer is transferred or deactivated | Built, tested | `case-workflow.service.ts`, `users.service.ts` |
| Investigation: notes, evidence review, statements, case evidence, fact corrections, vehicle trace (ownership history), driver | Built, tested | `cases.controller.ts` |
| Vehicle and person registers: duplicate checks, person views logged, station access only for its cases | Built, tested | `apps/api/src/modules/people` |
| Recommend → decide with readiness checks, S1/S2, send back, change with reason, outcome rules (court-only offences, warnings), HQ override, reopen, merge; NFA and warnings close the case (C4); citizens told "action taken" / "closed" | Built, tested (19 tests) | `case-workflow.service.ts` |
| Screens: case lists per role, case detail with every action, vehicle and person pages; dispatch choice in triage accept | Built | `apps/web/src/pages/cases` |
| HQ merge of duplicate person records (04 P2) | **Not started** | — |
| Time-limit alerts and escalation (deadlines are recorded on each case now) | Phase 5 | — |

### Phase 3 — Penalty notices and payments
Docs: [05](05-outcomes-and-penalty-notices.md), [07](07-payments-and-simulator.md)
- `penalty_notices`: issue, service (outbox), pay, nominate, dispute, overdue, reminders.
- Public payment page with the simulator (TEST MODE banner), signed confirmations, recorded
  receipts, refunds, daily reconciliation.
- Warnings and no-further-action outcomes.

**Done when:** every simulator outcome and every edge case in 07 §12 has a test; a replayed
confirmation is refused.

**Status (2026-10-22) — notices built; payments not started.**

| Item | State | Where |
|---|---|---|
| Notice issued in the same step as a penalty-notice decision; fines copied from the schedule in force; `PN-` numbers | Built, tested | `apps/api/src/modules/notices/notices.service.ts` |
| Service: posting recorded → served 3 days later, 14 days to respond; not delivered; re-serve to a new address | Built, tested | `notices.service.ts` |
| Outbox: notice letter, SMS pointer (no offence details), reminder, review letters — held, nothing sent (D15-3); HQ outbox screen | Built, tested | `outbox.service.ts`, `apps/web/src/pages/notices/OutboxPage.tsx` |
| Naming the driver: once, by the owner, before the due date; officer accepts → owner's notice transferred, new notice to the driver; or rejects | Built, tested | `notices.service.ts` |
| Disputes: one per notice; OIC/HQ upholds (notice withdrawn, case back to awaiting decision) or rejects (7 more days) | Built, tested | `notices.service.ts` |
| Overdue sweep every 15 minutes: reminder and final date, then court proposed; OIC confirms the referral | Built, tested | `notices.service.ts` |
| Withdrawal by HQ (case closes, C4); HQ override of a decision withdraws its notices | Built, tested | `notices.service.ts`, `case-workflow.service.ts` |
| Public look-up with the notice number and ID number, masked name; naming the driver and disputing online; 5 failed look-ups per 10 minutes per IP | Built, tested (API only) | `notices.controller.ts` |
| Screens: notice lists per queue, notice detail with every action, notices on the case page | Built | `apps/web/src/pages/notices` |
| Payments: simulator, public payment page, confirmations, recorded receipts, refunds, reconciliation (07) | **Not started** — data shapes only (`payments/payment.schema.ts`) | — |
| Public pages for the addressee (look-up, name the driver, dispute, pay) | **Not started** — API ready | — |
| Failed look-up limit is in memory; move to the database before running more than one API instance | To do | `notices.controller.ts` |

### Phase 4 — Court cases
Docs: [06](06-court-cases.md)
- `court_cases`, `courts`, referral from overdue notices and decisions, evidence bundle with
  fingerprints, hearings, verdicts, appeals.

**Done when:** referral → verdict and withdrawal paths pass; the bundle lists every item with its
fingerprint.

### Phase 5 — Time limits and notifications
Docs: [09](09-time-limits-and-notifications.md)
- One scheduler for every limit in 09 §4; escalation ladder; grouping; email digest; citizen push
  via `report_updates`; addressee messages to the outbox.

**Done when:** each limit in 09 §4 fires once in a test with a fake clock, and escalates at 2×.

### Phase 6 — Citizen rewards
Docs: [16](16-citizen-rewards.md), [07](07-payments-and-simulator.md) §9
- `reward_ledger`, `reward_accounts`, `payouts`; pending → confirmed → paid; reversals; expiry;
  fraud checks; weekly HQ payout batches through the simulator.

**Done when:** the reward follows the case outcome in every path (paid, withdrawn, refunded,
acquitted); the monthly cap and fraud checks are tested.

### Phase 7 — Dashboards and reports
Docs: [12](12-dashboards-and-reports.md)
- Role dashboards, definitions with tooltips, clickable figures, filters in the URL, validated
  chart colours, table view; scheduled PDF/CSV reports; system health page.

**Done when:** for every figure, the number equals the length of the list it opens (automated
test); a dashboard answers in under 1 second on 1 million generated reports.

### Phase 8 — Demerit points and privacy completion
Docs: [08](08-demerit-points.md), [10](10-evidence-audit-and-privacy.md) §5–7
- Demerit ledger behind the switch (off).
- Masking everywhere, person-view logging, export rules, retention job with HQ preview, legal
  hold, weekly integrity checks.

**Done when:** masking and view-logging tests cover every list and detail screen; a retention dry
run on staging lists the right records.

### Phase 9 — Migration and go-live
Docs: [14](14-data-model-and-migration.md) §6–7
- Migration scripts for every mapping in 14 §6.
- **Two full rehearsals** on staging with reconciliation, timed against the 2-hour window.
- HQ chooses an OIC for every station; staff training ([§6](#6-training-and-handover)).
- Go-live in the maintenance window; old collections read-only for 6 months.

**Done when:** both rehearsals reconcile with zero unexplained differences and finish inside the
window; HQ signs off.

## 5. Order and dependencies

```
0 Foundations ─► 1 Reports ─► 2 Cases ─► 3 Notices & payments ─┬─► 4 Court ──────┐
                                                               ├─► 6 Rewards ────┤
                                         5 Time limits (after 3)┘                ├─► 9 Go-live
                                         7 Dashboards (after 3, extended later) ─┤
                                         8 Demerit & privacy (after 4) ──────────┘
```

Phases 4, 5 and 6 can run in parallel once phase 3 is done, if the team has the people.

## 6. Training and handover

- A short **guide per role** (HQ, OIC, officer) with screenshots, written from the agreed docs.
- A training session on staging for HQ and a first group of stations before go-live.
- A **pilot**: switch on for one division first for 4 weeks, then the rest (D15-2).

## 7. Risks

| Risk | Mitigation |
|---|---|
| The mobile app team can't change their app in time | The import keeps the legacy `issueType` matching (11 §9); rewards wait for the new contract |
| Legal review changes retention or masking rules | Rules are settings; phase 8 is late in the order on purpose |
| Real GovPay integration requested early | Provider interface from phase 3 ([07](07-payments-and-simulator.md) §11) |
| Migration takes longer than the window | Two timed rehearsals; steps are idempotent and can resume |
| Teammates changing rules in code without updating docs | B3 and review (B2); docs are the source of truth |

## 8. Decisions

All decisions agreed on 2026-10-21 as recommended.

| # | Decision | Agreed |
|---|---|---|
| D15-1 | Phase order | **As §4–5, starting with the roles fix in phase 0.** |
| D15-2 | Roll-out | **Pilot in one division for 4 weeks, then island-wide.** |
| D15-3 | Messages before go-live | **SMS and post written to an outbox screen, not sent.** |
| D15-4 | Review rule | **Every pull request reviewed by a second team member; docs changed first when a rule changes.** |
| D15-5 | Test data on staging | **Masked copy of production — never real names, NIC or phone numbers.** |
| D15-6 | Definition of done | **The "done when" list of each phase, plus the doc marked Built with links to code and tests.** |

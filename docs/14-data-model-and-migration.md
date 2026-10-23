# 14 — Data model and migration

**Status:** Agreed (2026-10-21) · **Depends on:** [01](01-roles-and-permissions.md)–[11](11-citizen-app-integration.md), [12](12-dashboards-and-reports.md), [16](16-citizen-rewards.md) · **Last updated:** 2026-10-21

## 1. Purpose

Pieces 01–16 describe behaviour. This piece turns them into **collections, fields, indexes and
rules**, and defines how today's data moves into the new model without losing anything or
stopping the service for long.

## 2. Current state (as of 2026-10-21)

| Collection | Holds today | Problem |
|---|---|---|
| `violations` | Report **and** case in one record; status `pending / open / in_review / verified / resolved / rejected`; station assignment; status history; evidence list | A report and a case have different lives ([02](02-reports-and-triage.md), [03](03-cases-and-dispatch.md)) |
| `citations` | Citation number, lines, fine, due date, `paymentStatus` (`unpaid / paid / appealed / waived / void`) | No addressee, service, responses or payment record |
| `dispatches` | Station, method, flags, received/returned, SLA alerts, history | Status names (`sent / received / in_progress / resolved`) differ from the case states |
| `reports` | Mobile app reports (app-owned, shared database) | Free-text offence, no `clientReportId` ([11](11-citizen-app-integration.md)) |
| `users` | Staff **and** citizens; roles `dev / hq / station_officer` | No OIC role; dev can do business actions ([01](01-roles-and-permissions.md) P1–P5) |
| `violationcatalogentries` | Offence schedule (name, legal code, fine, severity) | No demerit points, no public copy |
| `policestations`, `divisions`, `stationauditlogs` | Stations, divisions, station audit | Kept as built |
| `evidenceuploads`, `notifications`, `settings`, `reportruns`, `counters`, `citizenreportskips` | As named | Kept; some extended |

Missing entirely: vehicles, persons, penalty notices, court cases, payments, refunds, demerit
points, reward ledger, payouts, a single audit log, evidence custody.

## 3. Modelling rules

- M1. **One record type per collection, one writer per collection** (shared-database rule from
  [11](11-citizen-app-integration.md) applies to every collection).
- M2. **States are enums in one shared module** per record type (like today's
  `violationStatus.js`), and **transitions are a table** — the code refuses any move not in it
  ([03](03-cases-and-dispatch.md) C1).
- M3. **Numbers** (`RP-`, `TC-`, `PN-`, `CR-`) come from the existing `counters` collection,
  one sequence per prefix per year, assigned inside the same transaction as the insert.
- M4. **Money** is stored as integer **rupees** (fines have no cents); reward points as integers.
- M5. **Times** stored in UTC; displayed in Sri Lanka time ([12](12-dashboards-and-reports.md) D7).
- M6. **Copies, not links, for anything legal:** a notice copies offence names, legal codes and
  fines at issue, so a later schedule change can't alter it.
- M7. **Append-only** collections (audit log, custody events, payments, refunds, demerit entries,
  reward ledger) have no update or delete path in the code; corrections are new entries.
- M8. **Multi-record changes use transactions** (MongoDB replica set — already required for the
  built dispatch code).
- M9. Every record has `createdAt`, `updatedAt`, and a `schemaVersion` number.

## 4. Collections

Names are new collections written by this system unless marked *existing*.

### 4.1 Intake and cases
| Collection | Key fields | Main indexes |
|---|---|---|
| `incident_reports` | `reportNumber`, `channel`, `receivedAt`, `receivedBy`, `reporter` {kind, userId, name, phone}, `sourceReportId` + `clientReportId` (app), `occurredAt`, `location` (GeoJSON point), `address`, `vehicleNumber`, `vehicleType`, `offenceIds[]`, `description`, `evidenceIds[]`, `capturedInApp`, `triage` {status, reasonCode, note, by, at, lockedBy, lockedUntil}, `priority`, `caseId`, `flags[]` | `reportNumber` unique; `sourceReportId` unique (partial); `triage.status + receivedAt`; `location` 2dsphere; `vehicleNumber + occurredAt` (duplicate check) |
| `report_questions` | Needs-information question, answer (copied from `report_replies`), due date | `reportId` |
| `cases` | `caseNumber`, `reportIds[]`, `priority`, `offences[]`, `occurredAt`, `location`, `vehicleId`, `ownerId`, `driverId`, `stationId`, `dispatchId`, `investigatingOfficerId`, `status`, `recommendation`, `decision`, `outcomes[]` {kind, refId, finished}, `dueAt` (current stage limit), `flags[]` | `caseNumber` unique; `stationId + status`; `investigatingOfficerId + status`; `status + dueAt` (overdue); `location` 2dsphere |
| ~~`dispatches`~~ | **Changed while building (2026-10-21):** the dispatch history is kept on the case (`cases.dispatches[]`), changed in the same write as the case's state. The old `dispatches` collection is read once at migration (§6.3) and not written by the new system. | — |

### 4.2 Vehicles and people
| Collection | Key fields | Main indexes |
|---|---|---|
| `vehicles` | `plate`, `plateCategory`, `type`, `make`, `model`, `colour`, `ownership[]` {personId, from, to, source}, `flags` | `plate` unique |
| `persons` | `type`, `name`, `nic`, `businessRegNo`, `licenceNumber`, `address`, `phone`, `mergedInto` | `nic`, `businessRegNo`, `licenceNumber` unique (partial, when present) |
| `demerit_entries` | `personId`, `points`, `offences`, `caseId`, `noticeId` / `courtCaseId`, `offenceDate`, `expiresAt`, `recordedBy` | `personId + expiresAt` |

### 4.3 Outcomes and money
| Collection | Key fields | Main indexes |
|---|---|---|
| `penalty_notices` | `noticeNumber`, `caseId`, `addresseeId`, `lines[]` (copied), `amount`, `issuedAt`, `servedAt`, `dueDate`, `service` {method, address, attempts[]}, `status`, `responses[]`, `parentNoticeId`, `legacy` | `noticeNumber` unique; `status + dueDate`; `addresseeId` |
| `court_cases` | `courtRef`, `caseId`, `noticeId`, `accusedId`, `courtId`, `courtCaseNumber`, `charges[]`, `prosecutingOfficerId`, `evidenceBundle[]`, `hearings[]`, `verdict`, `courtFine`, `appeal`, `status` | `courtRef` unique; `status + nextHearingAt` |
| `courts` | Magistrate's Courts list; default court per station | `name` unique |
| `payments` | `reference`, `noticeId`, `amount`, `method`, `status`, `payerName`, `receivedAt`, `recordedBy`, `confirmation`, `test` (simulator) | `reference` unique; `noticeId`; `receivedAt` |
| `refunds` | `reference`, `paymentId`, `amount`, `reason`, `approvedBy`, `status` | `reference` unique |

### 4.4 Rewards (shared with the app — [11](11-citizen-app-integration.md))
| Collection | Writer | Key fields |
|---|---|---|
| `reward_ledger` | This system | `userId`, `reportId`, `caseId`, `kind` (pending / confirmed / reversed / expired / paid_out), `points`, `at`, `expiresAt` |
| `reward_accounts` | This system | Balances (derived from the ledger, cached), `status`, suspension reason |
| `payout_requests` | App | Amount, method, masked account |
| `payouts` | This system | `requestId`, `batchId`, `reference` (`SIMP-`), `status`, `test` |
| `offence_schedule_public` | This system | Published copy of the schedule without fines |

### 4.5 Evidence, audit and system
| Collection | Key fields |
|---|---|
| `evidence_items` | `reportId` / `caseId`, `kind`, `original` {storageKey, size, mime, sha256, retained}, `viewing` {storageKey, size, mime, sha256}, `capturedInApp`, `capturedAt`, `capturedLocation`, `integrity` {lastCheckedAt, ok} |
| `custody_events` | `evidenceId`, `event`, `actor`, `reason`, `at` |
| `audit_log` | §4.1 of [10](10-evidence-audit-and-privacy.md): `at`, `actor`, `action`, `target`, `summary`, `reason`, `source`, `prevHash`, `hash`; one global sequence `seq` (unique) so the chain has one order |
| `offence_schedule` | Replaces `violationcatalogentries`: adds `demeritPoints`, `rewardTier`, `effectiveFrom`, `effectiveTo` (a fine change is a new version, never an edit) |
| `setting_versions` | Every time limit (and later `demeritPoints.enabled`, `payments.provider`, reward rates) as append-only versions with `effectiveFrom`, so a change applies only to work started after it ([09](09-time-limits-and-notifications.md) T2). The old `settings` collection allows one row per key and can't hold that history; it stays with the old system |
| `notifications` *existing* | TTL index 90 days ([09](09-time-limits-and-notifications.md) N3) |
| `report_runs` *existing* | Extended with period, filters, file fingerprint ([12](12-dashboards-and-reports.md) §7) |
| `migrations` | Applied migration ids, time, counts, result (§5) |

### 4.6 Users and roles
- `users` *existing, shared*: staff roles become `hq`, `station_oic`, `station_officer`, `dev`
  (and `division_admin` later); `stationId`, `divisionId`. Citizens keep their app role.
- Staff and citizen fields stay apart: this system never writes citizen fields, the app never
  writes staff fields (D14-6).

## 5. How migrations run

- R1. **Expand → migrate → contract.** New collections and fields are added first; data is
  copied; the old fields/collections are kept **read-only** until the new code has run cleanly
  for a full cycle; only then are they removed (D14-2).
- R2. Each migration is a script in the new API's migrations folder (`apps/api/src/migrations/` — [17](17-architecture-and-stack.md)) with an id, is **idempotent**
  (safe to run twice), has a **dry run** that prints what it would change, and records itself in
  `migrations`.
- R3. **Backup before every run**; the restore is rehearsed on a copy of production first.
- R4. **Reconciliation after every run:** counts in = counts out, per status; a sample of 50
  records compared field by field; mismatches stop the next step.
- R5. Run in a **maintenance window** (writes paused; the mobile app keeps writing to `reports`,
  which is imported after the window) (D14-3).

## 6. Mapping today's data

### 6.1 Violations → reports and cases
Each `violations` record becomes **one report**; if it got past triage, it also becomes **one
case**. Both keep `legacyViolationId` and the old number for search.

| Old status | Report | Case |
|---|---|---|
| `pending` | `pending` (back in the triage queue) | — |
| `rejected` | `rejected`, reason `legacy_rejected`, old reason kept as the note | — |
| `open` | `accepted` | `open`, or `dispatched` if a dispatch exists |
| `in_review` | `accepted` | `investigating` (from the dispatch state when one exists) |
| `verified` with a citation | `accepted` | `decided` (outcome = the legacy notice) |
| `verified` without a citation | `accepted` | `recommended` — goes to the OIC queue for a decision |
| `resolved` | `accepted` | `closed`, outcome `legacy_resolved` |

- `statusHistory` becomes the case timeline **and** audit entries marked `migrated: true`.
- `possibleDuplicateOf` becomes report flags for triage to review.
- Priority is set to **P3** for migrated items unless HQ changes it (D14-4).
- `callerName`, `callerMobile`, `callerAnonymous` → `reporter`.
- Free-text `type`/`title` that doesn't match the schedule → flag "offence not recognised".

### 6.2 Citations → legacy penalty notices
As agreed in [05](05-outcomes-and-penalty-notices.md) §9: `legacy: true`, no addressee required.

| Old `paymentStatus` | Notice status |
|---|---|
| `unpaid` | `served` (legacy — no nomination, dispute or court escalation) |
| `paid` | `paid`, with a payment record `method: legacy`, reference = citation number |
| `appealed` | `disputed` (OIC review) |
| `waived` | `withdrawn`, reason "waived (legacy)" |
| `void` | `withdrawn`, reason "void (legacy)" |

Lines and fine amounts are copied as they are. The old citation number is kept as `legacyNumber`;
new notices use `PN-`.

### 6.3 Dispatches
Status names change to match the case: `sent` → `dispatched`, `received` → `accepted`,
`in_progress` → `investigating`, `resolved` → `closed`, `returned` → `returned`. History and
SLA alerts stay.

### 6.4 Users and roles
- `hq` → `hq`. `dev` → `dev` with business permissions removed ([01](01-roles-and-permissions.md) P1).
- `station_officer` → `station_officer`. **Each active station needs an OIC**: HQ chooses one per
  station before go-live; stations without one are listed on the HQ dashboard ([09](09-time-limits-and-notifications.md) §4).
- Accounts created by HQ with the `dev` role are listed for review (P5).

### 6.5 Evidence
Each `evidenceFiles` item → `evidence_items` with `original.retained: false` (only the hash
exists), `viewing` = the stored file, and a `received` custody event dated with the original
`uploadedAt`. The old `images` / `videos` / `audios` URL arrays are converted the same way,
without a hash (flag `no_fingerprint`).

### 6.6 Offence schedule
`violationcatalogentries` → `offence_schedule` version 1 (`effectiveFrom` = go-live).
`demeritPoints` empty until HQ fills them; `rewardTier` = the existing severity. The public copy
is published on the first run.

### 6.7 Mobile app reports
Existing imported reports keep their link (`sourceReportId`). Their app status is converted once
to `report_updates` ([11](11-citizen-app-integration.md) §9).

### 6.8 Rewards
No rewards are paid retroactively: the reward ledger starts at go-live; reports accepted before
that earn nothing (D14-5).

## 7. Order of migration

1. Back up; create new collections and indexes (empty).
2. Roles and OICs (§6.4).
3. Offence schedule (§6.6).
4. Evidence items (§6.5).
5. Reports and cases (§6.1), then dispatches (§6.3).
6. Legacy notices and payments (§6.2).
7. App report updates (§6.7).
8. Audit log genesis entry, then migrated history entries, chained.
9. Reconcile (R4); switch the code to the new model; keep the old collections read-only.
10. After the agreed period, archive and drop the old collections (D14-2).

## 8. Edge cases

| Situation | Rule |
|---|---|
| A violation with a citation but status `pending` | Treated as `verified` with a citation; flagged for HQ review |
| Two citations on one violation | Both become notices on the same case; flagged |
| A dispatch that points to a deleted station | Case goes back to `open` for re-dispatch; flagged |
| Plates that fail the normaliser | Kept as entered, flag `plate_unrecognised` (as built) |
| A migration fails half-way | Each step is idempotent: fix and run again; reconciliation must pass before the next step |

## 9. Loopholes this closes

| Loophole | Closed by |
|---|---|
| Statuses changed to anything by any code path | Enums + transition table per record (M2) |
| Notices changing when the schedule changes | Copied lines, versioned schedule (M6, §4.5) |
| History edited after the fact | Append-only collections (M7), hash chain |
| Half-finished multi-record changes | Transactions (M8) |
| Data lost in the move | Expand → migrate → contract, backups, reconciliation (§5) |
| Two systems overwriting each other in shared collections | One writer per collection (M1) |

## 10. Decisions

All decisions agreed on 2026-10-21 as recommended.

| # | Decision | Agreed |
|---|---|---|
| D14-1 | Separate collections for reports and cases | **Yes — `incident_reports` and `cases`** (the name `reports` stays with the mobile app). |
| D14-2 | Keep old collections after migration | **Read-only for 6 months, then archived (backup kept 10 years with the audit log) and dropped.** |
| D14-3 | Downtime | **One maintenance window at night (target under 2 hours), announced in advance.** |
| D14-4 | Priority for migrated items | **P3, HQ can raise it.** |
| D14-5 | Rewards for reports before go-live | **None — the ledger starts at go-live.** |
| D14-6 | Shared `users` collection | **Kept, with staff fields and citizen fields written only by their own system.** |
| D14-7 | Money units | **Whole rupees as integers.** |
| D14-8 | Offence schedule changes | **Versioned — a new version with dates, never an edit.** |

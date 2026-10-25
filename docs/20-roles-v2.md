# 20 — Roles and permissions, version 2

**Status:** Agreed (2026-10-23) · **Replaces:** [01](01-roles-and-permissions.md) for
`New Backend/` and `New Frontend/` · **Last updated:** 2026-10-23

## 1. Why a new role model

The first model ([01](01-roles-and-permissions.md)) has four roles: developer, HQ, station OIC
and traffic officer. In practice the HQ role does six different jobs: triage, dispatch,
decisions, money, accounts and settings. As a result:

- **Duties can't be separated.** The person who records a receipt can approve it; the person who
  manages accounts can also decide cases.
- **Nobody can be given read-only oversight.** An auditor or a senior officer who only needs to
  see figures has to be given full HQ power.
- **There is no middle level.** Divisions (SSP/SP offices) exist in the police structure but have
  no role, so every escalation goes straight to HQ.
- **Station paperwork is done by investigators.** Recording walk-in reports, posting notices and
  taking counter payments fall on traffic officers.

Version 2 splits these jobs into 11 roles at three levels.

## 2. Levels and scope

Every role works at one level, and that level decides which records it can see.

| Level | Sees | Account belongs to |
|---|---|---|
| **National** | All records | No station |
| **Division** | Records of the stations in its division | One division |
| **Station** | Records of its station; traffic officers act only on cases assigned to them | One station |

In the permission matrix (§5), a grant has a **scope**:

| Mark | Scope |
|---|---|
| **N** | Nationally |
| **D** | Own division's stations |
| **S** | Own station |
| **A** | Records assigned to the user (investigating officer) |
| **R** | Read only, at the role's level |
| — | No access |

## 3. The roles

| # | Role | Key | Level | Typical holder | Does |
|---|---|---|---|---|---|
| 1 | System administrator | `system_admin` | National | IT unit | System health, technical settings, administrator accounts. **No access to cases, people or evidence.** |
| 2 | HQ administrator | `hq_admin` | National | Traffic HQ admin officer | Accounts, stations and divisions, offence schedule, time limits, reward rules |
| 3 | HQ operator | `hq_operator` | National | Traffic HQ desk | Triage reports, record reports from HQ channels, dispatch cases |
| 4 | HQ supervisor | `hq_supervisor` | National | Senior officer at Traffic HQ | Decisions escalated to HQ, overrides, notice withdrawals, disputed jurisdiction, everything an operator does |
| 5 | Finance officer | `finance_officer` | National | Accounts branch | Review recorded receipts, approve refunds and reward payouts, reconciliation |
| 6 | Auditor | `auditor` | National | Internal audit / oversight | Read everything, including the audit log. **Changes nothing.** |
| 7 | Executive viewer | `executive` | National | IGP, DIG Traffic | Read-only dashboards and management reports. **No personal data, changes nothing.** |
| 8 | Division supervisor | `division_supervisor` | Division | SSP/SP office | Oversees its stations, moves cases between them, decides when an OIC investigated, reviews disputes |
| 9 | Station OIC | `station_oic` | Station | Officer in charge | Accepts dispatches, assigns officers, decides outcomes, manages station officers and clerks |
| 10 | Traffic officer | `traffic_officer` | Station | Investigating officer | Investigates assigned cases, recommends outcomes, serves notices |
| 11 | Station clerk | `station_clerk` | Station | Station desk / reserve | Records walk-in and phone reports, posts notices, records counter payments |

## 4. Rules every role follows

- **R1. Deny by default.** Every API route names the permission it needs, or is explicitly
  public. A route without one fails to start.
- **R2. One place to check scope.** A helper decides whether a user may act on a record (its
  station, its division, or its assignment). Services never compare role names directly.
- **R3. Division and station roles belong to exactly one active division or station.** Moving one
  is an HQ administrator action and is logged.
- **R4. Two-step sign-in** (authenticator app) is required for all national roles and the division
  supervisor. Station roles can turn it on.
- **R5. Every change records who did it** (user, role, station or division) and when, in the audit
  log.
- **R6. The frontend only hides.** It shows what the user's permissions allow, but the backend
  decides every request on its own.

## 5. Permission matrix

Columns: SA system admin · HA HQ admin · HO HQ operator · HS HQ supervisor · FO finance officer ·
AU auditor · EX executive · DS division supervisor · OIC station OIC · TO traffic officer · SC
station clerk.

### 5.1 Reports and evidence

| Permission | SA | HA | HO | HS | FO | AU | EX | DS | OIC | TO | SC |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `reports.view` | — | — | N | N | — | R | — | D | S | S | S |
| `reports.record` (staff channels) | — | — | N | N | — | — | — | — | S | S | S |
| `reports.triage` | — | — | N | N | — | — | — | — | — | — | — |
| `reporters.suspend` (suspend a mobile-app reporter; lift a flag or suspension) | — | — | — | N | — | — | — | — | — | — | — |
| `evidence.viewOriginal` | — | — | N | N | — | R | — | D | S | A | — |

### 5.2 Cases and people

| Permission | SA | HA | HO | HS | FO | AU | EX | DS | OIC | TO | SC |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `cases.view` | — | — | N | N | — | R | — | D | S | S | S |
| `cases.dispatch` | — | — | N | N | — | — | — | D | — | — | — |
| `cases.acceptReturn` | — | — | — | — | — | — | — | — | S | S | — |
| `cases.assignOfficer` | — | — | — | N | — | — | — | D | S | — | — |
| `cases.investigate` | — | — | — | — | — | — | — | — | S | A | — |
| `cases.recommend` | — | — | — | — | — | — | — | — | S | A | — |
| `cases.decide` | — | — | — | N | — | — | — | D | S | — | — |
| `cases.override` | — | — | — | N | — | — | — | — | — | — | — |
| `persons.view` | — | — | — | N | — | R | — | D | S | A | S |
| `persons.merge` | — | N | — | — | — | — | — | — | — | — | — |
| `retention.manage` (preview and run data retention, turn it on after the legal review — docs/10 §6) | — | N | — | — | — | — | — | — | — | — | — |
| `demerit.manage` (turn demerit points on or off, set the thresholds — docs/08 §2, §7) | — | N | — | — | — | — | — | — | — | — | — |
| `demerit.refer` (record a driver's referral to the Department of Motor Traffic — docs/08 §7) | — | — | — | N | — | — | — | — | — | — | — |

### 5.3 Notices, court and payments

| Permission | SA | HA | HO | HS | FO | AU | EX | DS | OIC | TO | SC |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `notices.view` | — | — | N | N | N | R | — | D | S | S | S |
| `notices.serve` (post, re-serve, not delivered) | — | — | — | — | — | — | — | — | S | S | S |
| `notices.recordResponse` (nomination or dispute received on paper) | — | — | — | — | — | — | — | — | S | S | S |
| `notices.reviewNomination` | — | — | — | N | — | — | — | D | S | S | — |
| `notices.reviewDispute` | — | — | — | N | — | — | — | D | S | — | — |
| `notices.withdraw` | — | — | — | N | — | — | — | — | — | — | — |
| `court.view` | — | — | — | N | — | R | — | D | S | S | S |
| `court.record` (filing, hearings, results) | — | — | — | — | — | — | — | — | S | A | S |
| `court.confirmReferral` | — | — | — | N | — | — | — | D | S | — | — |
| `payments.view` | — | — | — | N | N | R | — | D | S | — | S |
| `payments.recordReceipt` | — | — | — | — | N | — | — | — | S | — | S |
| `payments.reviewReceipt` | — | — | — | — | N | — | — | — | — | — | — |
| `payments.approveRefund` | — | — | — | — | N | — | — | — | — | — | — |
| `payments.reconcile` | — | — | — | — | N | R | — | — | — | — | — |

### 5.4 Rewards, reference data and accounts

| Permission | SA | HA | HO | HS | FO | AU | EX | DS | OIC | TO | SC |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `rewards.view` | — | N | — | N | N | R | — | — | — | — | — |
| `rewards.manageRules` | — | N | — | — | — | — | — | — | — | — | — |
| `rewards.review` (release or place a hold, reverse points, freeze or exclude an account — docs/16 §7) | — | — | — | N | — | — | — | — | — | — | — |
| `rewards.approvePayouts` | — | — | — | — | N | — | — | — | — | — | — |
| `offences.view` | — | N | N | N | N | R | R | D | S | S | S |
| `offences.manage` | — | N | — | — | — | — | — | — | — | — | — |
| `stations.view` | — | N | N | N | — | R | R | D | S | S | S |
| `stations.editContact` | — | — | — | — | — | — | — | D | S | — | — |
| `stations.manage` (stations, divisions, areas) | — | N | — | — | — | — | — | — | — | — | — |
| `users.view` | N | N | — | — | — | R | — | D | S | — | — |
| `users.manage` (see §6 for which roles) | N | N | — | — | — | — | — | — | S | — | — |
| `settings.timeLimits` | — | N | — | — | — | — | — | — | — | — | — |
| `settings.system` | N | — | — | — | — | — | — | — | — | — | — |
| `audit.view` | — | N | — | N | — | R | — | D | S | — | — |
| `system.health` | N | — | — | — | — | — | — | — | — | — | — |

### 5.5 Dashboards and reports

| Permission | SA | HA | HO | HS | FO | AU | EX | DS | OIC | TO | SC |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `dashboard.national` (Command center) | — | N | N | N | N | R | R | — | — | — | — |
| `dashboard.division` | — | — | — | — | — | — | — | D | — | — | — |
| `dashboard.station` (My station) | — | — | — | — | — | — | — | — | S | — | — |
| `dashboard.mine` (My work) | — | — | — | — | — | — | — | — | — | A | S |
| `managementReports.view` (exports, monthly reports) | — | N | — | N | N | R | R | D | S | — | — |

The executive viewer's dashboards and reports contain **counts, rates and record numbers only**,
never names, ID numbers or addresses.

## 6. Who manages which accounts

| Actor | Can create and manage |
|---|---|
| System administrator | System administrators and HQ administrators |
| HQ administrator | Every role except system administrator and HQ administrator |
| Station OIC | Traffic officers and station clerks at their own station |
| Anyone else | Nobody |

Nobody can change their own role, station, division or active status (S5).

## 7. Separation of duties

| # | Rule | Enforced where |
|---|---|---|
| S1 | The officer who recommended an outcome can't decide it. | Case decision |
| S2 | If the OIC investigated the case, the decision goes to the **division supervisor**; if there is none, to an **HQ supervisor**. | Case decision |
| S3 | The person who recorded a receipt can't review it. | Payment review |
| S4 | A refund or a reward payout batch is approved by a different person from the one who prepared it. | Refunds, payouts |
| S5 | Nobody administers their own account. | Accounts |
| S6 | Auditor and executive viewer accounts can never make a change, whatever else is configured. | Access check, before any write |
| S7 | System administrators never see cases, people, evidence or payments. | Access check |
| S8 | A dispute is reviewed by someone other than the officer who issued or served the notice. | Dispute review |

## 8. Mapping from the first model

| Version 1 role | Becomes |
|---|---|
| `dev` | `system_admin` |
| `hq` | Split by person into `hq_admin`, `hq_operator`, `hq_supervisor` or `finance_officer` |
| `station_oic` | `station_oic` |
| `station_officer` | `traffic_officer` (or `station_clerk` for desk staff) |
| `division_admin` (reserved) | `division_supervisor` |

## 9. Signing in (agreed 2026-10-23)

| Topic | Rule |
|---|---|
| Sign-in ID | **Email or police service number** — either one, with the password |
| First sign-in | The account manager (doc 20 §6) creates the account with a temporary password. The user sets their own password, then — if their role requires it — sets up two-step sign-in, and only then reaches their home page. |
| Passwords | At least 12 characters; refused if common or containing the user's name, email or service number; no forced periodic change |
| Forgotten password | **The account manager resets it** to a temporary password; the user must change it at the next sign-in. No email reset. |
| Two-step sign-in | **Authenticator app** (Google or Microsoft Authenticator). Required for national roles and the division supervisor; optional for station roles. 10 one-time recovery codes for a lost phone; the account manager can reset two-step sign-in. |
| Failed attempts | 5 wrong passwords or codes lock the account for 15 minutes; the account manager can unlock it sooner. Sign-in attempts are also limited per network address. |
| Session length | **Shift-based:** signed out after 12 hours, or after 30 minutes without activity (15 minutes for national roles). A warning appears one minute before. |
| Devices | "Me" lists signed-in devices with "sign out everywhere". |
| Audit | Every sign-in, failure, lock, password change and two-step change is in the audit log. |

## 10. Decisions

| # | Decision | Recommended |
|---|---|---|
| D20-1 | Adopt the 11 roles in §3 | **Yes** (agreed 2026-10-23) |
| D20-2 | Two-step sign-in required for national roles and the division supervisor | **Yes** (2026-10-23) |
| D20-3 | Division supervisor decides when the OIC investigated (S2) | **Yes** (2026-10-23), HQ supervisor when the station has no division |
| D20-4 | The executive viewer never sees personal data | **Yes** (2026-10-23) |
| D20-5 | Station clerk can record counter payments, but only finance reviews them (S3) | **Yes** (2026-10-23) |

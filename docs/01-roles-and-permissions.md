# 01 — Roles and permissions

**Status:** Agreed (2026-10-20) · **Depends on:** [00](00-overview-and-glossary.md) · **Last updated:** 2026-10-20

> **Amended 2026-10-20:** mobile app and citizen rewards added; the reward rules themselves are in [16](16-citizen-rewards.md) (agreed 2026-10-20).

## 1. Purpose

Decide exactly who can do what. Every other piece refers to these roles; the backend enforces
them on every request, and the frontend only hides what a role can't use.

## 2. Current state (as of 2026-10-20)

Roles in the code: `dev`, `hq`, `station_officer` (`station_admin` was removed on 2026-10-18).

Problems with the current state:

| # | Problem | Effect |
|---|---|---|
| P1 | `dev` passes every `requireRole` check, but 18 service-level checks compare `role === "hq"`. | `dev` gets **403 on Violations and Citations** and "not found" on station profiles; behaviour is inconsistent page to page. |
| P2 | Officers may move cases to verified, rejected, resolved, overturn a verification and reopen a rejected case. | No separation of duties: one officer can report-check, decide and close their own work. Undoes the earlier four-eyes and HQ-only-overturn rules. |
| P3 | `hq` can create `dev` accounts, and `dev` bypasses all checks. | **Privilege escalation**: any HQ user can give themselves (or anyone) unrestricted access. |
| P4 | No officer-in-charge role. | Nobody at a station can approve outcomes or manage the station's officers and contact details. |
| P5 | Cases belong to a station, not a person. | Nobody is individually responsible for working a case; workload per officer is invisible. |

## 3. Roles

| Role | Value | Scope | Who holds it |
|---|---|---|---|
| **HQ Traffic Unit** | `hq` | National | Officers at Police HQ (DIG Traffic Control and Road Safety's unit) |
| **Division supervisor** *(phase 2 of roles)* | `division_admin` | One division | SSP/SP's office |
| **Station OIC** | `station_oic` | One station | The officer-in-charge (or acting OIC) |
| **Traffic officer** | `station_officer` | One station | Traffic officers at the station |
| **Developer** | `dev` | System | The technical team |
| **Citizen** | `user` *(mobile app)* | Their own reports and rewards | Members of the public using the E-Vigilance mobile app |
| **System** | — | Automated | Scheduled jobs and the citizen-app import |

### 3.1 Rules every role follows

- R1. **One person, one account.** Accounts are personal; sharing is not allowed. NIC and email
  are unique.
- R2. **Station roles belong to exactly one active station.** Moving station is an HQ action and
  is logged.
- R3. **Role and station come from the database on every request**, never from the login token
  (already built: deactivation and transfers take effect immediately).
- R4. **Oversight checks use one helper**, never role-string comparisons scattered in services:
  - `canOversee(user)` — `hq` (and `dev` for read-only system views, see §4.5)
  - `canActOnStation(user, stationId)` — `station_oic` / `station_officer` of that station
  - `isCaseDecider(user, case)` — see §5
- R5. **Every write records who did it** (user id, role, station) and when.

## 4. What each role can do

### 4.1 HQ Traffic Unit (`hq`)
- Triage every report: accept, merge, ask for information, reject.
- Open, merge, dispatch and re-dispatch cases; override dispatch.
- See every station, case, notice and court case nationally.
- **Override** a decided outcome and **reopen** a closed case — always with a reason.
- Record court filings and verdicts (also OIC).
- Manage the offence schedule, stations, divisions, settings, and all user accounts except `dev`.
- Withdraw penalty notices (with reason).

### 4.2 Station OIC (`station_oic`)
Everything a traffic officer can do at their station, plus:
- **Decide** the outcome of the station's cases (approve or change the recommendation) — except
  where they were the investigating officer (§5).
- Assign or reassign the **investigating officer** for a case.
- Review **disputes** on the station's penalty notices.
- Record court filings and hearings for the station's cases.
- Manage `station_officer` accounts **at their own station** (create, deactivate, reset password).
- Edit their station's contact details (phone, email, OIC name).

### 4.3 Traffic officer (`station_officer`)
- See their station's cases and the station inbox.
- **Accept** a dispatched case, or **return** it to HQ with a reason (not our area).
- Work cases assigned to them: trace the vehicle and owner, add evidence and notes, record
  statements.
- **Recommend** an outcome, with reasons.
- File walk-in complaints for their station (already built).

### 4.4 Division supervisor (`division_admin`) — later
- Read everything for their division's stations.
- Reassign cases between stations within the division.
- Receive time-limit escalations before HQ.

### 4.5 Developer (`dev`)
- System settings, user accounts (including other `dev` accounts), data tools, logs, health.
- Read-only access to operational screens **for support**, with every view logged.
- **Must not** triage, dispatch, decide, override, withdraw, or record payments or court results.
- `dev` accounts can only be created by another `dev` (never by `hq`).

### 4.6 Citizen
- Submit reports and follow their own reports' milestones (received → under review → action
  taken → closed). See [11 — Citizen app integration](11-citizen-app-integration.md) *(planned)*.
- Earns reward points for correct tips and requests payouts ([16](16-citizen-rewards.md)).
- Never sees offender identity, notice details or fine amounts.

### 4.7 System
- Imports citizen reports, runs time-limit checks, sends reminders, cleans up unclaimed uploads.
- Its actions are logged as `system` with the job name.

## 5. Separation of duties

| Rule | Detail |
|---|---|
| S1. Recommend ≠ decide | The person who recommended an outcome cannot be the one who decides it. |
| S2. OIC investigated it | If the OIC was the investigating officer, the decision goes to **HQ** (or the division supervisor once that role exists). |
| S3. Override needs a reason | HQ overrides and reopens always carry a written reason, shown in the case history. |
| S4. Money and people | Recording a payment made outside the simulator, and withdrawing a notice, need a reason and are reviewed in HQ's audit view. |
| S5. No self-administration | Nobody can change their own role, station, or active status (already built for HQ). |
| S6. Last administrator | There must always be at least one active `hq` and one active `dev` account. |

## 6. Permission matrix

✓ = allowed · ◐ = own station / own work only · R = read-only · — = not allowed

| Action | Officer | OIC | Division* | HQ | Dev |
|---|:-:|:-:|:-:|:-:|:-:|
| See reports awaiting triage | — | — | — | ✓ | R |
| Record a report (walk-in, phone, officer — WhatsApp/phone for HQ) and see own station's reports | ◐ | ◐ | — | ✓ | — |
| Triage (accept / merge / needs info / reject) | — | — | — | ✓ | — |
| See cases | ◐ | ◐ | ◐ division | ✓ | R |
| Dispatch / re-dispatch | — | — | ◐ within division | ✓ | — |
| Accept / return a dispatched case | ◐ | ◐ | — | — | — |
| Assign investigating officer | — | ◐ | — | ✓ | — |
| Trace vehicle / owner, add evidence, notes | ◐ assigned | ◐ | — | ✓ | — |
| Recommend outcome | ◐ assigned | ◐ | — | — | — |
| Decide outcome | — | ◐ (S1, S2) | ◐ (S2 cases) | ✓ | — |
| Override decision / reopen case | — | — | — | ✓ (reason) | — |
| Review notice dispute | — | ◐ | — | ✓ | — |
| Withdraw penalty notice | — | — | — | ✓ (reason) | — |
| Record payment outside simulator | — | ◐ (reason) | — | ✓ (reason) | — |
| Record court filing / hearing / verdict | — | ◐ | — | ✓ | — |
| View person records (PII) | ◐ assigned cases | ◐ | — | ✓ | — |
| Offence schedule | R | R | R | ✓ | R |
| Stations / divisions | R own | R own, edit contact | R division | ✓ | R |
| User accounts | — | ◐ officers | — | ✓ (not `dev`) | ✓ |
| Approve citizen reward payouts | — | — | — | ✓ | — |
| Reward rules (points per offence, caps) | — | — | — | ✓ | R |
| System settings | — | — | — | ✓ | ✓ |
| Audit log | — | ◐ station | ◐ division | ✓ | ✓ |
| Dashboards | My Station | My Station | Division | Command Center | Command Center (R) |

\* Division column applies once `division_admin` exists.

## 7. Accounts lifecycle

| Event | Who | Rules |
|---|---|---|
| Create | HQ (any non-dev role), OIC (officers at own station), Dev (any) | NIC, email and name required; station roles need an active station. |
| Appoint OIC | HQ | Exactly one active OIC per station (D01-2). Appointing a new one demotes the previous to officer. |
| Transfer station | HQ | Open cases assigned to that officer are returned to the OIC for reassignment. |
| Deactivate | HQ, OIC (own officers), Dev | Takes effect on the next request (built). Their open cases go back to the OIC. |
| Reactivate | Same as deactivate | |
| Password reset | HQ, OIC (own officers), Dev, self | Logged. |

## 8. Loopholes this closes

| Loophole | Closed by |
|---|---|
| HQ creates a `dev` account and bypasses everything (P3) | §4.5: only `dev` creates `dev`; `dev` has no case authority |
| `dev` refused on some pages, allowed on others (P1) | R4: one set of helpers |
| An officer decides and closes their own work (P2) | §5 S1–S2 |
| No one at a station owns decisions (P4) | `station_oic` role |
| Cases with no individually responsible officer (P5) | Investigating officer (§4.2, D01-1) |
| A transferred or deactivated officer's cases sit untouched | §7: returned to the OIC |
| A station with no OIC | D01-2 / time-limit alert to HQ (piece 09) |

## 9. Decisions

All decisions agreed on 2026-10-20 as recommended.

| # | Decision | Agreed |
|---|---|---|
| D01-1 | Should every case have an **investigating officer**? | **Yes.** The officer who accepts a case becomes its investigating officer by default; the OIC can reassign. |
| D01-2 | One OIC per station, with an **acting OIC** when the OIC is away? | **Yes.** Exactly one active OIC; HQ can appoint an acting OIC (same powers, logged). Stations with no OIC are flagged to HQ. |
| D01-3 | When the OIC investigated the case, who decides? | **HQ** now; the division supervisor once that role exists. |
| D01-4 | Should `dev` exist in production? | **Yes, but limited**: technical admin only, no case actions, read-only operational views with every view logged. Only `dev` can create `dev`. |
| D01-5 | Can the OIC manage their own officers' accounts? | **Yes**, for their station only (create, deactivate, reset password). |
| D01-6 | Division supervisor role timing | **Later** (already agreed) — the matrix above reserves its permissions. |
| D01-7 | Migration of current accounts | HQ picks the OIC for each station from its existing officers; everyone else stays `station_officer`. `dev` accounts are reviewed and reduced to the technical team. |

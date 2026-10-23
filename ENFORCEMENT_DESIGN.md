# E-Vigilance — Enforcement Design

**Status:** Agreed direction, not yet built. Written 2026-10-20.
**Detailed specification:** the [`docs/`](docs/README.md) folder expands each part of this summary
into its own piece (roles, triage, cases, investigation, outcomes, payments, design system, …).
Where the two differ, `docs/` wins.
**Supersedes:** the case/fine parts of [`VIOLATIONS_BUSINESS_LOGIC.md`](VIOLATIONS_BUSINESS_LOGIC.md)
(its catalog, workflow and citation sections). [`PROJECT_STORYLINE.md`](PROJECT_STORYLINE.md)
remains the history of how the system got here.

This document describes how E-Vigilance should model traffic enforcement so that it matches how
Sri Lanka Police actually works. It is the reference for the rebuild: the data model, the
lifecycles, who may do what, the time limits, and the order in which we build it.

---

## 1. Purpose

E-Vigilance turns a traffic offence that someone saw (a citizen with a phone, an officer, a
camera) into a lawful outcome against the right person: a penalty notice, a court case, a
warning, or a recorded decision to take no action. The admin panel is the police side of that
journey — HQ triage, station investigation, the officer-in-charge's decision, and follow-up until
the matter is closed.

---

> **Mobile app and rewards (added 2026-10-20):** the public reports offences mainly through the
> E-Vigilance mobile app, and citizens whose tips prove correct are rewarded — see
> [`docs/16-citizen-rewards.md`](docs/16-citizen-rewards.md).

## 2. How enforcement works in Sri Lanka (the reality we model)

| Fact | What it means for us |
|---|---|
| The public already reports offences through the **e-Traffic app** (since Jan 2025) and a **24-hour WhatsApp line** (since Apr 2026). Reports go to **Police HQ** (DIG Traffic Control and Road Safety), which investigates and **assigns cases to divisions/stations for legal action**. | HQ triages every report before a station sees it. Reports arrive through several channels. |
| Police warn the public **not to send fabricated or AI-generated videos**. | Triage needs a "fake / not credible" decision, and repeat abuse must be visible. |
| When an offence is detected without stopping the vehicle (CCTV), the **penalty notice goes to the registered owner's address** with the video. | A remotely reported offence is enforced against the **registered owner**, who can then name the actual driver. |
| **Spot fines** are issued face-to-face: the officer holds the licence; the driver pays and the licence is returned. Payment is now via **GovPay** (all nine provinces since 3 Feb 2026) or cash agents. | Payment is a reference-backed event, not a dropdown. We simulate GovPay for now (§10). |
| Serious offences (e.g. drunk or reckless driving) go to the **Magistrate's Court**. Unpaid or disputed fines also end up in court. | A court path is a first-class outcome. |
| A **demerit points** scheme (24 points → suspension) has been piloted but is not fully in force. | Points are recorded but switchable in settings, off by default. |
| Territorial structure: **Province → Range → Division (45) → Police District → Station (607)**. | Already modelled (divisions + stations). Police Districts are skipped. |

Legal details that vary or that we could not confirm — fine amounts per offence, the exact number
of days to pay or respond, the full list of spot-fineable offences — are **configuration, not
code**. Defaults below are placeholders to be confirmed against the Motor Traffic Act schedules
and Sri Lanka Police guidance before real use.

---

## 3. Design principles

1. **A report is not a case.** Citizens send reports; police work cases. Many reports can describe
   one incident.
2. **No punishment without an identified person.** A penalty is always addressed to a named,
   identified owner or driver.
3. **Every decision has an owner and a reason.** Who decided, when, why — always recorded.
4. **Separation of duties.** The officer who investigates recommends; the OIC decides; HQ oversees.
5. **Nothing is silently lost.** Deadlines escalate; nothing is deleted when it can be closed.
6. **Evidence is preserved.** Original hashes, compressed copies, access history (already built).
7. **The reporter is kept informed** — without exposing anything about the offender.

---

## 4. Roles

| Role | Value | Can do |
|---|---|---|
| **HQ Traffic Unit** | `hq` | Triage reports; open, merge and dispatch cases; oversee every station; manage the offence schedule, stations, divisions and users; record court results; see all dashboards. |
| **Division (SSP)** *(later phase)* | `division_admin` | Oversee their division's stations and cases; reassign cases within the division. |
| **Station OIC** | `station_oic` | Everything an officer can do at their station, **plus** decide the outcome of a case, handle disputes on penalty notices, edit the station's contact details. |
| **Traffic officer** | `station_officer` | Accept cases dispatched to their station, investigate, trace vehicles, attach evidence and statements, **recommend** an outcome. |
| **Developer** | `dev` | Technical administration only: system settings, user accounts, data tools, logs. **No case decisions.** |

Rules:
- An officer never decides their own recommendation — the OIC does (four-eyes rule).
- Only HQ can overturn a decided outcome or reopen a closed case, and always with a reason.
- `hq` and `dev` are checked through one helper (`isHq(role)` for oversight reads; case authority
  is `hq` only) — never by comparing role strings in each service.

> **Change from today:** the current roles (`dev`, `hq`, `station_officer`) let officers verify,
> overturn and reopen cases, and let `dev` pass every check. Phase 1 restores the separation above.

---

## 5. Domain model

```
Report ──many-to-one──► Case ──one-to-many──► Outcome
                         │                     ├─ PenaltyNotice ──► Payment
                         │                     ├─ CourtCase
                         │                     ├─ Warning
                         │                     └─ NoFurtherAction
                         ├──► Vehicle ──► Person (registered owner)
                         ├──► Person (driver, if named)
                         ├──► Dispatch (station; already built)
                         └──► Evidence (from all linked reports)
```

### 5.1 Report
What someone submitted. Read-only once received (except for "more information" replies).

| Field | Notes |
|---|---|
| `channel` | `citizen_app`, `whatsapp`, `phone`, `walk_in`, `officer`, `cctv` |
| `reporter` | Citizen account, or name/phone, or anonymous |
| `occurredAt`, `location`, `address` | When/where the offence happened |
| `vehicleNumber` (as reported), `vehicleType` | Plate normalised to the Sri Lankan format |
| `offences` | Offence schedule entries the reporter chose |
| `description`, `evidence` | Evidence keeps original + compressed hashes |
| `triage` | `pending` → `accepted` / `merged` / `needs_info` / `rejected`, with reason, who, when |
| `caseId` | Set when accepted or merged |

### 5.2 Case
What police work. Replaces today's `Violation`.

| Field | Notes |
|---|---|
| `caseNumber` | Human-readable, e.g. `TC-2026-004213` |
| `reports[]` | All reports describing this incident |
| `offences[]` | Final offences (may differ from what reporters chose) |
| `vehicle`, `owner`, `driver` | Links to Vehicle / Person once traced |
| `assignedStation`, `dispatch` | As built today (jurisdiction → nearest; accept; return to HQ) |
| `status` | See §6.2 |
| `recommendation` | Officer's proposed outcome + reason |
| `decision` | OIC's outcome + reason (or HQ's override) |
| `outcomes[]` | Penalty notice(s), court case, warning, no-further-action |

### 5.3 Vehicle
Our own register, built up as officers trace vehicles (we cannot query the Department of Motor
Traffic directly).

| Field | Notes |
|---|---|
| `plate` | Canonical Sri Lankan format, unique |
| `type`, `make`, `model`, `colour` | |
| `registeredOwner` | Person |
| `ownerSource` | `dmt_lookup` (officer looked it up) + who, when — so the record is traceable |
| `history` | Owner changes over time |

### 5.4 Person
An owner or driver.

| Field | Notes |
|---|---|
| `name`, `nic`, `licenceNumber`, `address`, `phone` | NIC and licence number unique when present |
| `points` | Demerit points ledger (when enabled) |
| `offenceHistory` | Derived from cases and outcomes — repeat-offender view |

Access to Person records is HQ and the handling station only, and every view is logged.

### 5.5 Offence schedule
The current Violation Catalog, extended.

| Field | Notes |
|---|---|
| `name`, `legalCode`, `severity`, `vehicleTypes` | As today |
| `disposal` | `fineable` (penalty notice possible) or `court_only` |
| `fineAmount` | Fixed amount for fineable offences |
| `demeritPoints` | Used when points are enabled |
| `isActive` | Retired entries stay on old cases |

### 5.6 Penalty notice
Replaces today's `Citation`. Always addressed to a Person.

| Field | Notes |
|---|---|
| `noticeNumber` | Unique, e.g. `PN-2026-000318` |
| `addressee` | Owner first; the named driver if the owner nominates |
| `offences`, `amount` | Copied from the schedule when issued |
| `issuedAt`, `dueDate` | Due date from settings (§8) |
| `status` | See §6.3 |
| `responses[]` | Pay / nominate driver / dispute, each with who and when |
| `payment` | Reference, amount, method, paid at (from the simulator, §10) |

### 5.7 Court case

| Field | Notes |
|---|---|
| `court`, `caseNumber` | e.g. Colombo Magistrate's Court, case number |
| `reason` | Court-only offence / disputed notice / unpaid notice |
| `hearings[]` | Dates and notes |
| `verdict` | `convicted` (fine, points, other) / `acquitted` / `withdrawn` |

---

## 6. Lifecycles

### 6.1 Report triage (HQ Traffic Unit)

```
pending ─┬─► accepted  → a new Case is opened and dispatched
         ├─► merged    → attached to an existing Case (duplicate)
         ├─► needs_info→ reporter asked a question; returns to pending on reply
         └─► rejected  → reason required (not an offence / not credible / fake / outside Sri Lanka)
```
- The duplicate check (same plate, or same offence nearby, within 24h) suggests cases to merge into.
- A reporter whose reports are repeatedly rejected as fake is flagged for HQ.

### 6.2 Case

```
open ─► dispatched ─► accepted ─► investigating ─► recommended ─► decided ─► (outcome running) ─► closed
                 └─► returned to HQ (not our area) → re-dispatched
```
- **dispatched / accepted / returned** — as built today (24h to accept, 72h to start work).
- **investigating** — trace vehicle → owner; collect statements; review evidence.
- **recommended** — the officer proposes an outcome with a reason.
- **decided** — the OIC approves or changes it (four-eyes). HQ may override with a reason.
- **closed** — when every outcome is finished: notice paid / court verdict / warning issued /
  no-further-action recorded.

Outcomes:

| Outcome | When | Requires |
|---|---|---|
| Penalty notice | Fineable offence, owner identified | Vehicle traced to an owner; evidence attached |
| Court referral | Court-only offence, or escalation from a notice | Offender identified; evidence attached |
| Warning | Minor first offence (no prior record for this person/vehicle) | Offender identified |
| No further action | Offender can't be identified, evidence insufficient, or not an offence | Reason |

### 6.3 Penalty notice

```
issued ─┬─► paid            (payment confirmed by the simulator) → closed; points recorded
        ├─► nominated       (owner names the driver) → a new notice to the driver; this one closes
        ├─► disputed        → OIC reviews → withdrawn, or court referral
        └─► overdue         (due date passed) → reminder → final due date → court referral
withdrawn ← HQ/OIC with reason (e.g. evidence later found wrong)
```

### 6.4 Court case

```
referred ─► filed (case number) ─► hearing(s) ─► verdict ─► closed
```

---

## 7. Permissions matrix

| Action | Officer | OIC | HQ | Dev |
|---|:-:|:-:|:-:|:-:|
| Triage reports | | | ✓ | |
| Open / merge / dispatch cases | | | ✓ | |
| Accept / return a dispatched case | ✓ | ✓ | | |
| Investigate, trace vehicle, add evidence | ✓ | ✓ | ✓ | |
| Recommend outcome | ✓ | ✓ | | |
| Decide outcome | | ✓ (not own recommendation) | ✓ (override, reason) | |
| Handle notice disputes | | ✓ | ✓ | |
| Record court filings / verdicts | | ✓ | ✓ | |
| Reopen closed case | | | ✓ (reason) | |
| Manage offence schedule, stations, divisions | | | ✓ | |
| Manage users | | own station's officers | ✓ | ✓ |
| System settings, data tools | | | ✓ | ✓ |

---

## 8. Time limits (settings, defaults to be confirmed)

| Limit | Default | On breach |
|---|---|---|
| Triage a new report | 24 h | Flag on HQ dashboard |
| Station accepts a dispatch | 24 h | Alert HQ + station (built) |
| Station starts work | 72 h | Alert HQ + station (built) |
| Recommendation after acceptance | 7 days | Alert OIC |
| OIC decision after recommendation | 3 days | Alert HQ |
| Penalty notice payment / response | 14 days | Reminder |
| Final due date after reminder | +7 days | Court referral |
| Oldest incident that can be filed | 30 days | Refused at intake (built) |

---

## 9. Reporter feedback and abuse

- Reporters see milestones only: **received**, **under review**, **action taken**, **closed**
  (with "no action possible" where applicable). They never see the offender's identity, the
  notice or the fine.
- HQ can ask a reporter for more information (`needs_info`).
- Rejections as **fake / fabricated / AI-generated** are counted per reporter. Over a threshold,
  the reporter is flagged and their new reports are marked for extra scrutiny.

---

## 10. Payment simulator

The real GovPay integration needs an agreement with ICTA and LankaPay. Until then, a **simulator**
stands in so the whole flow can be built, tested and demonstrated.

- A separate **"Payment Simulator — test mode"** page. It must **not** use the GovPay name, logo
  or styling, and shows a clear "No real money — test mode" banner.
- Looks up a notice by **notice number + addressee NIC**, shows the amount due, and offers:
  **Pay (success)**, **Card declined (failure)**, **Pay later**.
- On success it issues a **payment reference** (`SIM-…`) and confirms to the backend the same way
  a real gateway callback would (a signed, server-to-server confirmation), so swapping in GovPay
  later only replaces this adapter.
- Staff can also record a payment made elsewhere (cash agent / receipt number) — with the
  receipt reference required and the action audited.
- Paid notices close; points are recorded if enabled.

---

## 11. Demerit points (switchable)

- Off by default (`settings.demeritPoints.enabled = false`) because the national scheme is a pilot.
- When on: points from the offence schedule are added to the Person's ledger when a notice is
  paid or a court convicts; a warning threshold and a suspension threshold (default 24) raise
  flags for HQ. The system records and flags; it does not itself suspend licences.

---

## 12. Evidence and audit (already built — kept)

- Evidence: SHA-256 of the original before compression; compressed copy stored; file type checked
  from content; uploads staged and claimed; unclaimed files cleaned up.
- Every status change, decision, override, payment and record view is logged with who and when.

---

## 13. Dashboards (built last, on the new model)

**HQ / Dev — Command Center:** reports awaiting triage; unassigned cases; not accepted (24h) and
overdue (72h); awaiting OIC decision; notices overdue; disputes; court cases pending; KPIs vs the
previous period (new reports, cases closed, time to decision, notices paid %, amount collected);
trend; case pipeline; top offences; hotspot map; source channels; divisions needing attention;
activity feed.

**Station — My Station:** new dispatches to accept; my investigations; awaiting OIC; notices and
disputes for the station; overdue items; this month's figures.

---

## 14. Migration from the current data

- Each existing **Violation** becomes one **Report + Case** pair; citizen-app imports keep their
  link to the citizen report. Statuses map: `open/pending` → case `open`/`dispatched` (by
  dispatch state); `in_review` → `investigating`; `verified` → `decided` (penalty notice);
  `rejected` → report `rejected`; `resolved` → `closed`.
- Each existing **Citation** becomes a **Penalty notice** marked `legacy` (no addressee — it was
  issued before owners were traced); paid/waived statuses carry over.
- Roles: `station_officer` stays; the OIC at each station is chosen by HQ and given `station_oic`.
- The migration runs as a dry run first and is idempotent (same pattern as the existing scripts).

---

## 15. Build plan

| Phase | Scope | Done when |
|---|---|---|
| **1. Roles** | `station_oic`; `dev` technical only; one role helper; workflow permissions per §7 | Officers can't decide or overturn; `dev` gets HQ reads everywhere; all existing tests pass |
| **2. Reports → cases** | Report and Case models; HQ triage queue; merge; needs-info; reporter milestones; migration | Five reports of one incident make one case; reporters see milestones |
| **3. Vehicles and people** | Vehicle register; owner tracing; Person records; repeat-offender view; access logging | A case can't be decided until the vehicle is traced (where required) |
| **4. Outcomes** | Recommendation → OIC decision; penalty notices with pay / nominate / dispute / overdue → court; court cases; warnings; NFA; payment simulator; demerit points toggle | A notice can be paid in the simulator and the case closes; unpaid notices escalate to court |
| **5. Dashboards** | HQ Command Center and My Station on the new model | Every number links to the list behind it |

Each phase ships with end-to-end tests against a real (in-memory) MongoDB, as the existing
features do.

---

## 16. Open questions (to confirm with Sri Lanka Police guidance)

1. Exact fine amounts and which offences are spot-fineable (Motor Traffic Act schedules).
2. Legal period to pay or respond to a notice, and when non-payment must go to court.
3. Whether a warning is a recognised outcome for remotely reported offences.
4. How a remote penalty notice is served (post, SMS, both) and proof-of-service requirements.
5. Demerit points: offence point values once the scheme is in force nationally.

---

## 17. Sources

- [GovPay — Police Traffic Spot Fines](https://govpay.lk/en/spot-fine)
- [GovPay online traffic fine payment islandwide rollout](https://govpay.lk/en/news/govpay-online-traffic-fine-payment-system-achieves-islandwide-rollout)
- [LankaPay — digital traffic fine payments across all provinces](https://www.lankapay.net/en/news/digital-traffic-fine-payments-now-available-across-all-provinces-via-govpay)
- [Sunday Observer — Sri Lanka pilots digital traffic fine payment](https://sundayobserver.lk/2025/04/27/news-features/50777/sri-lanka-pilots-digital-traffic-fine-payment-to-cut-red-tape-and-corruption)
- [Ada Derana — e-Traffic mobile app launched](https://adaderana.lk/news/104652/sri-lanka-police-launches-e-traffic-mobile-app-to-combat-traffic-violations-)
- [Ada Derana — public urged to send reckless driving videos via WhatsApp](https://www.adaderana.lk/news/121087/public-urged-to-send-videos-related-to-reckless-driving-to-police-via-whatsapp)
- [Newsfirst — WhatsApp hotline for reporting reckless driving](https://english.newsfirst.lk/2026/04/11/whatsapp-hotline-launched-for-reporting-reckless-driving)
- [Sri Lanka Police — software to fine violators using surveillance](https://www.police.lk/?p=5516)
- [Sunday Times — demerit scheme driving bans](https://www.pressreader.com/sri-lanka/sunday-times-sri-lanka/20221127/281908777156165)
- [Sri Lanka Police Performance Report 2024 — organisational structure](https://www.parliament.lk/uploads/documents/paperspresented/1758173460045362.pdf)

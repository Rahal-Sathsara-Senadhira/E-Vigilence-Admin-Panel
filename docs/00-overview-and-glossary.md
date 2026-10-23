# 00 — Overview and glossary

**Status:** Agreed (2026-10-20) · **Depends on:** — · **Last updated:** 2026-10-20

> **Amended 2026-10-20:** mobile app and citizen rewards added; the reward rules themselves are in [16](16-citizen-rewards.md) (agreed 2026-10-20).

## 1. What the system is for

Sri Lanka Police receives reports of traffic offences from the public, from its own officers,
and from cameras. For the public, the main channel is the **E-Vigilance mobile app**: anyone can
record an offence they see on a Sri Lankan road (photo, video or voice note, with the location)
and send it in. Reports also arrive by WhatsApp, phone and at station counters. Each report has to be checked, sent to the station responsible for the area, investigated
until the offender is identified, and closed with a lawful outcome.

E-Vigilance is the police side of that journey. It must make sure that:

- every credible report becomes a case that someone is responsible for;
- every case reaches the right station and is acted on within set time limits;
- every penalty is addressed to an identified person and is backed by evidence;
- every decision records who made it and why;
- the person who reported it is told what happened, without learning anything private about the
  offender;
- citizens whose tips prove correct are **rewarded**, and people who send false reports gain
  nothing and can be stopped.

## 2. Scope

**In scope**
- Intake of reports from all channels, especially the **E-Vigilance mobile app** used by the
  public (a separate project that shares this system's database).
- **Citizen rewards** for correct tips: points, payouts and fraud checks ([16](16-citizen-rewards.md)).
- HQ triage, merging of duplicate reports, dispatch to stations by jurisdiction.
- Station investigation: accepting cases, tracing vehicles and owners, collecting evidence.
- Outcomes: penalty notices, court referrals and results, warnings, no-further-action.
- Payment recording, with a **payment simulator** until a real gateway is connected.
- Demerit points (switchable), time limits, notifications, audit, dashboards.
- Police structure: provinces, ranges, divisions, stations.

**Out of scope (for now)**
- Direct connection to the Department of Motor Traffic (vehicle registry) — officers enter what
  they look up.
- Real payment collection (GovPay) — simulated.
- Spot fines issued at the roadside with licence holding — officers may record them, but the
  roadside process itself is outside this system.
- Suspending licences — the system records points and flags thresholds; it does not suspend.
- The mobile app itself (a separate project); only what it sends, receives and shows about
  reports and rewards is covered here ([11](11-citizen-app-integration.md), [16](16-citizen-rewards.md)).

## 3. The journey in one picture

```
Someone sees an offence
        │
        ▼
REPORT ──► HQ triage ──► rejected / needs info / merged into an existing case
        │
        ▼ accepted
CASE ──► dispatched to the station for that area ──► accepted by the station
        │
        ▼
Investigation: identify the vehicle and its owner, review evidence
        │
        ▼
Officer recommends ──► OIC decides
        │
        ├─► Penalty notice ──► paid / driver named / disputed / overdue ──► court if needed
        ├─► Court referral ──► hearing ──► verdict
        ├─► Warning
        └─► No further action (with reason)
        │
        ▼
CASE CLOSED ──► the reporter is told the result (no personal details)
        │
        ▼
Correct tip? ──► reward points confirmed ──► payout to the citizen
```

## 4. Who uses it

| Actor | In short |
|---|---|
| **HQ Traffic Unit** | Receives every report, decides which are real cases, sends them to stations, oversees everything. |
| **Division (SSP's office)** | Oversees the stations in its division. *(Later phase.)* |
| **Station OIC** | Officer-in-charge of a station; decides the outcome of the station's cases. |
| **Traffic officer** | Works the station's cases: accepts, investigates, recommends. |
| **Developer** | Keeps the system running; no say in cases. |
| **Citizen** | Reports offences through the E-Vigilance mobile app, follows their progress, and earns rewards for correct tips. |
| **System** | Automated jobs: imports, time-limit checks, reminders, clean-up. |

Exact permissions are in [01 — Roles and permissions](01-roles-and-permissions.md).

## 5. Glossary

| Term | Meaning |
|---|---|
| **Report** | One submission about an offence, from one source. Never changed after it is received, except to add requested information. |
| **Case** | The police matter that one or more reports describe. Cases are what stations work on. |
| **Incident** | The real-world event: one vehicle, one place, one time. One incident = one case. |
| **Triage** | HQ's first look at a report: accept (new case), merge (existing case), ask for information, or reject. |
| **Merge** | Attaching a report to an existing case because it describes the same incident. |
| **Channel** | How a report arrived: mobile app, WhatsApp, phone, walk-in, officer, camera. |
| **Mobile app** | The E-Vigilance app the public uses to report offences on Sri Lankan roads and follow their reports and rewards. Also called the citizen app. |
| **Tip** | A citizen's report seen from the reward side: a tip is *correct* when police take enforcement action on it. |
| **Reward points** | Points a citizen earns for a correct tip, by offence; confirmed once the outcome is final. |
| **Payout** | Converting confirmed points to money, paid to a verified citizen (simulated for now). |
| **Dispatch** | Sending a case to a station. Recorded with how the station was chosen. |
| **Jurisdiction** | The area a station polices, drawn on the map by HQ. |
| **Accept** | A station acknowledging that a dispatched case is theirs. |
| **Return** | A station sending a case back to HQ because it is outside their area. |
| **Investigating officer** | The officer responsible for working a case. |
| **Trace** | Identifying a vehicle's registered owner (looked up by an officer). |
| **Registered owner** | The person a vehicle is registered to; the default addressee of a penalty notice for a remotely reported offence. |
| **Recommendation** | The investigating officer's proposed outcome, with reasons. |
| **Decision** | The OIC's (or HQ's) approved outcome, with reasons. |
| **Outcome** | What a decided case leads to: penalty notice, court referral, warning, or no further action. |
| **Penalty notice** | A formal demand to pay a fixed fine for a fineable offence, addressed to an identified person. |
| **Addressee** | The person a penalty notice is addressed to. |
| **Nomination** | The owner naming the driver who actually committed the offence; a new notice goes to that driver. |
| **Dispute** | The addressee formally contesting a notice. Leads to review, then withdrawal or court. |
| **Court referral** | Sending a matter to the Magistrate's Court. |
| **No further action (NFA)** | A decision to close a case without a penalty, with a recorded reason. |
| **Offence schedule** | The list of offences with legal reference, fine amount, demerit points, and whether the offence is fineable or court-only. |
| **Fineable offence** | An offence that may be settled by paying a fixed penalty. |
| **Court-only offence** | An offence that must go to court (e.g. drunk or reckless driving). |
| **Demerit points** | Points recorded against a driver for offences; thresholds trigger warnings and flags. |
| **Time limit** | A deadline on a step (e.g. accept within 24 h). Breaches are flagged and escalated. |
| **Province / Range / Division** | Sri Lanka Police territorial levels above stations (SDIG / DIG / SSP commands). |
| **Verified station** | A station whose name, location and division HQ has confirmed. |
| **Payment simulator** | A test-mode stand-in for a real payment gateway; no real money moves. |
| **Audit log** | The permanent record of who did what, and when. |

## 6. Principles

1. **A report is not a case.**
2. **No penalty without an identified person and evidence.**
3. **Every decision has an owner and a reason.**
4. **The person who investigates does not approve their own recommendation.**
5. **Deadlines escalate; nothing is quietly dropped.**
6. **Evidence is preserved as received** (original fingerprint kept even when compressed).
7. **People see only what their role needs**, and access to personal data is logged.
8. **Policy values are settings, not code.**

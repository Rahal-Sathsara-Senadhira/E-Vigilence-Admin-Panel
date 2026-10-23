# 03 — Cases and dispatch

**Status:** Agreed (2026-10-20) · **Depends on:** [02](02-reports-and-triage.md) · **Last updated:** 2026-10-20

## 1. Purpose

A **case** is the police matter that one or more reports describe. This piece defines how a case
is opened, which station gets it, who at that station is responsible for it, how it moves through
its life, and how it ends. Investigation details are in [04](04-investigation-vehicles-and-people.md)
*(planned)*; outcomes in [05](05-outcomes-and-penalty-notices.md) *(planned)*.

## 2. Current state (as of 2026-10-20)

Already built and kept:
- Dispatch by **jurisdiction first, then nearest active station**, recording the method, distance
  and warnings (overlap, unverified station, no active officers).
- Stations **accept** dispatched cases or **return** them to HQ with a reason.
- Time limits: not accepted in 24 h, no action in 72 h — HQ and the station are alerted once.
- Dispatch history survives re-dispatch, returns and station deactivation.
- Station deactivation moves every open case to another station first.

Missing today: a case number, an individually responsible officer, clear case states beyond the
old six statuses, rules for repeated returns, merging two cases, and when a case is closed.

## 3. The case record

| Field | Rules |
|---|---|
| `caseNumber` | `TC-2026-004213` — yearly sequence, never reused |
| `reports[]` | Every report describing this incident (at least one) |
| `priority` | From triage (P1 / P2 / P3) |
| `offences[]` | What police conclude was committed — editable until the case is decided |
| `occurredAt`, `location`, `address` | Confirmed by HQ at triage; correctable during investigation with a note |
| `vehicle`, `owner`, `driver` | Set during investigation ([04](04-investigation-vehicles-and-people.md)) |
| `assignedStation`, `dispatch` | Current station and dispatch record (built) |
| `investigatingOfficer` | The officer responsible (§6) |
| `status` | §4 |
| `recommendation`, `decision` | [05](05-outcomes-and-penalty-notices.md) |
| `outcomes[]` | Penalty notices, court case, warning, no further action |
| `timeline` | Every event on the case, in order (built today as `statusHistory`; extended) |

## 4. Case states

```
            ┌──────────── returned (station: not our area) ◄──────┐
            ▼                                                     │
open ─► dispatched ─► accepted ─► investigating ─► recommended ─► decided ─► closed
                                     ▲                  │
                                     └── sent back ─────┘  (OIC asks for more work)
closed ─► reopened (HQ only, reason) ─► investigating
```

| State | Means | Moves on when | Who | Family |
|---|---|---|---|---|
| `open` | Accepted at triage, not yet with a station | Dispatched | HQ / system | new |
| `dispatched` | Sent to a station, not yet accepted | Station accepts or returns | Station staff | new |
| `accepted` | The station has taken it; an investigating officer is set | Officer starts work | Officer | progress |
| `investigating` | Vehicle, owner, evidence being worked | Officer recommends an outcome | Officer | progress |
| `recommended` | Waiting for the OIC's decision | OIC decides, or sends back | OIC (HQ if the OIC investigated) | waiting |
| `decided` | Outcome approved; notices / court in progress | Every outcome finishes | System | good |
| `closed` | Finished | HQ reopens | — | good / closed |
| `returned` | The station sent it back as not their area | HQ re-dispatches | HQ | problem |

Rules:
- C1. A case can only move along the arrows above. Any other change is refused.
- C2. `accepted` → `investigating` happens automatically when the officer first records work
  (a note, evidence, a vehicle trace), so officers don't have to click a status.
- C3. The OIC can **send back** a recommendation for more work, with a reason. The case returns to
  `investigating`.
- C4. A case **closes automatically** when every outcome is finished: notice paid / withdrawn /
  court verdict / warning issued / no-further-action recorded.
- C5. Only **HQ** can reopen a closed case, with a reason. Reopening never changes a finished
  outcome by itself (a paid notice stays paid); new outcomes are added if needed.
- C6. A case opened at a station is **closed without action** if HQ merges or rejects its only
  report at review before it is dispatched ([02](02-reports-and-triage.md) §7). *(Added 2026-10-21.)*
- C7. *(Clarified 2026-10-21 while building.)* Besides the arrows above, the record allows the moves
  the other sections describe: re-dispatch from `dispatched`, `accepted` or `investigating` (§5.4);
  return from `accepted` before work starts (§5.3); `decided` → `recommended` on HQ override (§8);
  and closing an undecided case that is merged into another (§7).
- C8. *(Clarified 2026-10-21.)* If no active station can be found automatically when HQ accepts a
  report, the case stays `open` and appears in HQ's "not dispatched" list for a manual choice.

## 5. Dispatch

### 5.1 Choosing the station (built — rules confirmed)
1. An active station whose drawn **jurisdiction** contains the case location. If several overlap,
   the **smallest area** wins and the case is flagged.
2. Otherwise the **nearest active station**.
3. Dispatch records the method, distance and warnings: overlapping jurisdictions, unverified
   station, no active officers.
4. A case with **no location** can't be auto-dispatched; HQ chooses the station.

### 5.2 Who can dispatch
- **HQ**: dispatch, re-dispatch, or choose the station manually (reason required when overriding
  the automatic choice).
- **Station-originated** cases are dispatched to the station that recorded them, already
  accepted ([02](02-reports-and-triage.md) §7).
- **Division supervisor** *(later)*: move a case between stations within the division.

### 5.3 Accept and return (built — rules confirmed)
- A station accepts within **24 hours** (P1: 2 hours — see D03-6) or HQ and the station are alerted.
- A station can **return** a case to HQ only while it is `dispatched` or `accepted` and no work
  has been recorded, with a reason of at least 10 characters.
- **Repeated returns:** a case returned **twice** is flagged "disputed jurisdiction"; it can no
  longer be auto-dispatched — HQ must choose the station, and the second return notifies HQ
  supervisors. A station cannot return a case HQ dispatched to it manually after a dispute;
  it can only raise a note to HQ.

### 5.4 Re-dispatch
- Allowed while the case is `open`, `dispatched`, `returned`, `accepted` or `investigating`.
- Not allowed once `recommended` or later — the station that investigated owns the outcome.
  HQ can still move it with an override and reason.
- The previous assignment is kept in the dispatch history (built).

## 6. Investigating officer

- Every case at a station has **one investigating officer** ([01](01-roles-and-permissions.md) D01-1).
- The officer who **accepts** the case becomes its investigating officer by default.
- The **OIC** can reassign it to another officer at the station at any time, with a note.
- If the investigating officer is **transferred or deactivated**, their open cases return to the
  OIC's queue as "needs an investigating officer" (alert to the OIC).
- Only the investigating officer and the OIC can record investigation work on a case; other
  officers at the station can read it.
- The OIC's queue shows every case with no investigating officer.

## 7. Merging and splitting cases

**Merge** — two open cases turn out to describe the same incident (e.g. two triage decisions made
in parallel):
- HQ only, with a reason, and only if **neither case is decided**.
- One case survives; the other's reports, evidence and timeline move to it; the other is closed as
  `merged into TC-…`.

**Split** — one report describes offences by **two or more vehicles**:
- At triage, HQ opens **one case per vehicle**, all linked to the same report.
- The reporter follows each case's milestones.

## 8. Changes after a decision

- Once a case is `decided`, its offences, vehicle, owner/driver and location are **locked**
  (as verified violations are today).
- To change them, HQ **overrides** the decision with a reason; the case returns to `recommended`,
  and any penalty notice already issued is withdrawn ([05](05-outcomes-and-penalty-notices.md)).

## 9. Edge cases

| Situation | Rule |
|---|---|
| Case dispatched to a station with no active officers | Dispatch is allowed but flagged (built); HQ and the division are alerted; HQ should re-dispatch. |
| Station deactivated with open cases | All open cases move first (built). |
| OIC away | The acting OIC decides; if none is appointed, recommendations wait and HQ is alerted after the decision time limit. |
| Case location corrected during investigation and now falls in another station's area | The officer records the correction; the station may return the case (if no outcome yet) or keep it. |
| Same vehicle, two separate incidents | Two cases. The vehicle's history links them ([04](04-investigation-vehicles-and-people.md)). |
| A new report arrives for a decided case | Attached as additional information (02 §6.2); doesn't reopen it. |

## 10. Loopholes this closes

| Loophole | Closed by |
|---|---|
| Nobody personally responsible for a case | Investigating officer (§6) |
| Cases bounced between stations forever | Return limit and "disputed jurisdiction" (§5.3) |
| A case moved away after the work is done | No re-dispatch after `recommended` (§5.4) |
| Two parallel cases for one incident | Case merge (§7) |
| Changing facts after the penalty is set | Lock after decision; override withdraws the notice (§8) |
| Cases with no clear end | Automatic close when outcomes finish (C4) |

## 11. Decisions

All decisions agreed on 2026-10-20 as recommended.

| # | Decision | Agreed |
|---|---|---|
| D03-1 | Case number format | **`TC-YYYY-NNNNNN`**, yearly sequence. |
| D03-2 | `accepted` → `investigating` automatic on first recorded work | **Yes.** |
| D03-3 | How many returns before "disputed jurisdiction"? | **Two.** |
| D03-4 | Re-dispatch after `recommended` | **HQ override only**, with a reason. |
| D03-5 | Case merge and split | **Yes, HQ only**: merge before decision; one case per vehicle at triage. |
| D03-6 | Faster acceptance for urgent (P1) cases | **2 hours to accept, 24 hours to start work.** |
| D03-7 | Reopening closed cases | **HQ only, any time, with a reason**; finished outcomes stay as they are. |
| D03-8 | Who can record work on a case | **The investigating officer and the OIC**; other station officers read only. |

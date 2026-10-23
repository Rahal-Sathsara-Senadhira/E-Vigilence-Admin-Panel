# 02 — Reports and triage

**Status:** Agreed (2026-10-20) · **Depends on:** [01](01-roles-and-permissions.md) · **Last updated:** 2026-10-20

> **Amended 2026-10-20:** mobile app and citizen rewards added; the reward rules themselves are in [16](16-citizen-rewards.md) (agreed 2026-10-20).

## 1. Purpose

Every offence enters the system as a **report**. HQ's Traffic Unit looks at each report once
(**triage**) and decides whether it becomes a case, belongs to a case that already exists, needs
more information, or should be rejected. Triage is the filter that keeps stations working on real,
credible, non-duplicated cases.

## 2. Current state (as of 2026-10-20)

- Every submission becomes a `Violation` immediately — there is no report/case distinction and no
  triage step. Five people filming the same car create five violations.
- Citizen-app reports are copied in every minute from the shared `reports` collection
  (`citizenReportSync.js`) with an approximate status mapping.
- Duplicate detection only **flags** possible duplicates; nothing merges them.
- Staff complaints (New Complaint page) are validated well (plate, phone, time, location, offences)
  — those rules carry over to reports unchanged.
- There is no way to ask a reporter for more information, no rejection reasons for citizens, and
  no record of fake reports.

## 3. Channels

| Channel | `channel` | How it arrives | Entered by |
|---|---|---|---|
| Mobile app | `citizen_app` | Sent from the E-Vigilance mobile app (shares this system's database) and imported automatically | System |
| WhatsApp line | `whatsapp` | HQ staff record the message and attach the media | HQ |
| Phone call | `phone` | Staff take the call (HQ or station) | HQ, station staff |
| Walk-in | `walk_in` | A person reports at a station counter | Station staff |
| Officer observed | `officer` | An officer saw the offence | Station staff |
| Camera | `cctv` | Machine-to-machine ingest (future) | System |

## 4. The report record

A report is **evidence of what someone said**. Once received it must not be changed, except to
add information the reporter was asked for and to record triage.

| Field | Rules |
|---|---|
| `reportNumber` | `RP-2026-000123`, assigned on receipt |
| `channel`, `receivedAt`, `receivedBy` | Always set (`receivedBy` = staff member or `system`) |
| `reporter` | Citizen account / name + phone / anonymous. Phone in `+94…` form (built) |
| `occurredAt` | Required; not in the future; not older than 30 days (built) |
| `location`, `address` | Pin inside Sri Lanka + address or landmark (built). Citizen reports without a usable pin are accepted into triage and flagged |
| `vehicleNumber`, `vehicleType` | Plate normalised to the Sri Lankan format, or "plate unknown" (built) |
| `offences` | From the offence schedule only (built) |
| `description` | 10–2000 characters (built) |
| `evidence` | Photos, video, audio — original hash kept, compressed copy stored (built) |
| `triage` | Status, reason code, note, who, when (§6) |
| `caseId` | Set when accepted or merged |
| `priority` | Set at triage (§8) |

## 5. The triage queue (HQ Traffic Unit)

- Shows every report in `pending`, **highest priority first, then oldest first**.
- Each report opens side by side with **possible matching cases** (same plate in the last 24 h, or
  the same offence within ~150 m in the last 24 h — the existing duplicate check, extended to
  open cases).
- Time limit: a report should be triaged within **24 hours** (setting). Breaches are flagged on the
  HQ dashboard ([09](09-time-limits-and-notifications.md)).
- One person triages a report at a time: opening it marks it "in triage by <name>" for 15
  minutes, so two HQ staff don't decide the same report.

### Triage checklist (shown on screen)

1. Is it a traffic offence covered by the offence schedule?
2. Did it happen in Sri Lanka, within the last 30 days?
3. Is the evidence credible — not edited, staged or AI-generated?
4. Can the vehicle be identified (readable plate, or enough detail to trace)?
5. Does it describe an incident we already have a case for?

## 6. Triage outcomes

```
pending ──┬─► accepted   → a new case is opened (and dispatched)
          ├─► merged     → attached to an existing case
          ├─► needs_info → reporter asked a question → back to pending on reply
          │                 (no reply in 7 days → rejected: "no response")
          └─► rejected   → reason code + note
```

### 6.1 Accept
- Opens a new **case** with this report as its first report.
- HQ confirms or corrects the **offences**, **vehicle** and **location** for the case. The
  report keeps what the reporter said; the case holds what police concluded.
- The case is **dispatched** in the same step by default (jurisdiction first, then nearest —
  built), unless HQ chooses a station manually.
- A citizen report needs **at least one evidence file** to be accepted, unless HQ records why it
  can proceed without (e.g. corroborated by another report).

### 6.2 Merge
- Attaches the report to an **open** case describing the same incident.
- The report's evidence becomes available on the case; the reporter is linked and gets the
  case's milestones.
- If the matching case is already **closed**, the report is attached as additional information
  and the case is **not reopened** (only HQ can reopen, with a reason — [01](01-roles-and-permissions.md) §4.1).
- A merge can be **undone** by HQ (the report returns to `pending`), with a reason.
- Who earns the reward when several reports are merged is set in [16](16-citizen-rewards.md)
  (the first usable report leads; later ones may earn a smaller share).

### 6.3 Needs information
- HQ writes a question to the reporter (citizen app or phone). Typical: "Which direction was the
  vehicle travelling?", "Can you send the full video?".
- The reporter's reply is added to the report; the report returns to `pending` at its original
  place in the queue.
- No reply within **7 days** (setting) → rejected with reason `no_response`.
- Anonymous reports can't be asked — they are accepted, merged or rejected.

### 6.4 Reject

Every rejection has a **reason code** and an optional note. The reporter sees the plain-language
message, never the internal note.

| Code | Reporter sees |
|---|---|
| `not_an_offence` | "What you reported isn't a traffic offence we can act on." |
| `insufficient_evidence` | "We couldn't act on this report because the evidence wasn't enough." |
| `vehicle_unidentifiable` | "We couldn't identify the vehicle from this report." |
| `outside_jurisdiction` | "This happened outside Sri Lanka Police's area." |
| `too_old` | "This happened more than 30 days ago, so we can't act on it." |
| `fabricated` | "We couldn't accept this report." *(counts towards reporter abuse, §10)* |
| `abusive` | "We couldn't accept this report." *(counts towards reporter abuse)* |
| `not_traffic` | "This isn't a traffic matter. For other matters call 119." |
| `no_response` | "We closed this report because we didn't receive the information we asked for." |

- HQ can **reconsider** a rejected report within 30 days (it returns to `pending`), with a reason.

## 7. Station-originated reports

Walk-in, phone-to-station and officer-observed reports are recorded **at a station**.

- They create a report **and** a case assigned to that station in one step (as walk-ins do today),
  marked `triage: accepted (station)`.
- They appear in HQ's triage view as **"accepted by station — review"** so HQ can still merge
  them with an existing case or reject them, with a reason.
- An **officer-observed** report must be accepted into a case by **another officer or the OIC**
  — an officer cannot both observe and open the case alone (separation of duties,
  [01](01-roles-and-permissions.md) §5).
- If HQ merges or rejects a station-accepted report at review, the report leaves the station's
  case; a case left with no report, and not yet dispatched, is **closed** with the reason
  ([03](03-cases-and-dispatch.md) C6). *(Clarified 2026-10-21 while building.)*
- Station staff see their own station's reports (not HQ's queue).

## 8. Priority

| Priority | When | Effect |
|---|---|---|
| **P1 — Urgent** | Severe offence in the schedule (e.g. reckless or drunk driving), or the report says someone was hurt | Top of the queue; dispatched immediately on accept; shorter time limits ([09](09-time-limits-and-notifications.md)) |
| **P2 — Normal** | Everything else | Normal order and limits |
| **P3 — Low** | Minor offence with weak evidence that is still worth recording | Bottom of the queue |

Priority is suggested from the offence schedule's severity and can be changed by HQ with a reason.

> E-Vigilance is not an emergency service. Every reporting screen shows: *"If someone is in
> danger right now, call 119."*

## 9. What the reporter sees

| Report state | Reporter sees |
|---|---|
| pending | Received |
| needs_info | We need more information (with the question) |
| accepted / merged | Under review |
| case decided with an outcome | Action taken |
| case closed with no further action | Closed — no action possible |
| rejected | Closed — with the reason message (§6.4) |

The reporter never sees the offender's details, the station, the outcome type, or any amount
([10](10-evidence-audit-and-privacy.md)).

## 10. Reporter abuse

- Rejections with `fabricated` or `abusive` are counted per reporter.
- **3 such rejections within 90 days** (setting) → the reporter is **flagged**; their new reports
  show a warning in triage.
- HQ can **suspend** a citizen account from reporting, with a reason. Suspension is enforced by
  the citizen app ([11](11-citizen-app-integration.md)); E-Vigilance records it and
  rejects imports from suspended accounts.
- Flags and suspensions can be lifted by HQ, with a reason.
- A rejected report never earns reward points. A `fabricated` rejection also **cancels the
  reporter's pending points** and blocks payouts until HQ reviews the account ([16](16-citizen-rewards.md)).

## 11. Edge cases

| Situation | Rule |
|---|---|
| The same person sends the same incident twice | Merge the second into the first's case. |
| The citizen deletes the report in their app after sending it | Our copy stays; HQ can still act on it. Deleted-in-app reports are marked as such. |
| A report names an offence that doesn't match the evidence | HQ corrects the offences on the **case**; the report keeps what was claimed. |
| The plate is partly readable | `needs_info` if the reporter can be asked; otherwise HQ may accept with "plate unknown" if other details allow tracing. |
| Two HQ staff open the same report | The 15-minute triage lock (§5) shows who has it. |
| A report arrives for a case that is already in court | Attached as additional information; the station is notified. |
| The citizen app sends a report with no location | Accepted into triage with a warning; HQ sets the location from the address, or asks the reporter. |

## 12. Loopholes this closes

| Loophole | Closed by |
|---|---|
| Duplicate reports become duplicate cases (and potentially duplicate fines) | Merge (§6.2) |
| Stations waste time on non-offences and fakes | HQ triage before dispatch (§5–6) |
| Citizens never learn why nothing happened | Reason codes with reporter messages (§6.4, §9) |
| Fake or AI-generated videos have no consequence | Abuse counting, flagging and suspension (§10) |
| An officer opens a case on their own observation unchecked | Second officer/OIC acceptance (§7) |
| A report is silently changed after the fact | Reports are immutable; the case holds police conclusions (§4, §6.1) |

## 13. Decisions

All decisions agreed on 2026-10-20 as recommended.

| # | Decision | Agreed |
|---|---|---|
| D02-1 | Should every report go through HQ triage, or can stations open cases directly for walk-in and officer reports? | **Stations open directly** (§7), with HQ review afterwards — matches how a station counter works and keeps HQ's queue for remote reports. |
| D02-2 | Triage time limit | **24 hours** for P2, **2 hours** for P1 (settings). |
| D02-3 | Needs-information wait before automatic rejection | **7 days.** |
| D02-4 | Must citizen reports have evidence to be accepted? | **Yes**, unless HQ records a reason. |
| D02-5 | Abuse threshold for flagging a reporter | **3 fabricated/abusive rejections in 90 days.** |
| D02-6 | Can HQ suspend a citizen from reporting? | **Yes**, with a reason, enforced together with the citizen app. |
| D02-7 | WhatsApp reports: recorded manually by HQ staff, or imported automatically? | **Manually for now** — no WhatsApp integration exists; staff record the message and attach the media. |
| D02-8 | Priority levels | **Three (P1 urgent, P2 normal, P3 low)**, suggested from offence severity. |

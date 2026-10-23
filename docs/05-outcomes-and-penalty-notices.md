# 05 — Outcomes and penalty notices

**Status:** Agreed (2026-10-20) · **Depends on:** [04](04-investigation-vehicles-and-people.md) · **Last updated:** 2026-10-20

## 1. Purpose

This is where a case turns into a lawful result. The investigating officer **recommends** an
outcome, the OIC **decides**, and the outcome runs until it is finished. The most common outcome,
the **penalty notice**, has its own lifecycle: the addressee pays, names the real driver,
disputes it, or ignores it — and each path has a defined end.

## 2. Current state (as of 2026-10-20)

- Moving a violation to `verified` automatically issues a **citation** with the sum of the
  offences' fines, a due date (setting, default 30 days) and no addressee.
- Payment status is changed by hand (`unpaid → paid / appealed / waived`), with a required note
  and history; overturning a verification voids the citation.
- There is no recommendation/decision split, no warning or no-further-action outcome, no notice
  service, no naming of the driver, no dispute review and no escalation to court.

What carries over: fine copied from the offence schedule at issue time, one active notice per
case, the payment-status audit trail, voiding when a decision is overturned.

## 3. Recommendation (investigating officer)

The officer can recommend once the case is ready ([04](04-investigation-vehicles-and-people.md) §6).

| Outcome | Allowed when | Officer must provide |
|---|---|---|
| **Penalty notice** | Every confirmed offence is **fineable** | Addressee with address; evidence; offences |
| **Court referral** | Any offence is **court-only**, or the officer judges court appropriate | Addressee (or "driver unknown" with reason); evidence; offences; summary for the prosecution |
| **Warning** | Only **minor** offences, and no enforcement outcome for this person or vehicle in the last 12 months | Addressee with address |
| **No further action (NFA)** | Any time | Reason code (§8) and note |

The recommendation includes a short written justification.

## 4. Decision (OIC, or HQ)

- The **OIC** decides; **HQ** decides when the OIC was the investigating officer ([01](01-roles-and-permissions.md) S2).
- Options: **approve**, **change the outcome** (reason required), or **send back** for more work
  (reason required — the case returns to `investigating`).
- Time limit: **3 days** after the recommendation (setting); then HQ is alerted.
- On approval the case becomes `decided` ([03](03-cases-and-dispatch.md)) and its facts are locked.
- **HQ override** of a decision needs a reason; any running penalty notice is **withdrawn** and,
  if paid, refunded ([07](07-payments-and-simulator.md)).

## 5. The penalty notice

| Field | Rules |
|---|---|
| `noticeNumber` | `PN-2026-000318`, yearly sequence |
| `case`, `addressee` | The case and the identified person (owner, driver or organisation) |
| `offences`, `amount` | Offences and fines **copied from the schedule** at issue; amount = sum of the fines (D05-1) |
| `issuedAt`, `servedAt`, `dueDate` | Due date counts from service (§5.1) |
| `service` | Method (post, SMS, both), address used, attempts, result |
| `status` | §6 |
| `responses[]` | Nomination, dispute, payment — each with who, when, details |
| `payment` | Reference, amount, method, time ([07](07-payments-and-simulator.md)) |
| `parentNotice` | Set on a notice reissued to a nominated driver |

### 5.1 Service
- The notice is sent by **post** to the addressee's address, and by **SMS** when a phone number
  is known (SMS carries the notice number and how to respond — never the offence details).
- A posted notice is **deemed served 3 days after posting** (setting); SMS alone does not count
  as service.
- **Returned mail / unknown address** → `service_failed`: the officer finds a new address and
  re-serves, or the case goes to court referral.

### 5.2 The notice document
A printable notice with: notice number, addressee, vehicle, date/time/place, offences with legal
references, amount, due date, **how to pay** (payment simulator for now), **how to name the
driver**, **how to dispute**, and still images from the evidence. No reporter details ever.

## 6. Notice lifecycle

```
issued ─► served ─┬─► paid ─────────────────────────────► closed
                  ├─► nominated ─► transferred  (new notice to the named driver)
                  ├─► disputed ─┬─► upheld    ─► withdrawn
                  │             └─► rejected  ─► back to served with a new due date
                  └─► overdue ─► reminder ─► final overdue ─► court referral
        service_failed ─► re-served, or court referral
withdrawn ← HQ with a reason (refund if paid)
```

| Status | Family | Notes |
|---|---|---|
| `issued` | new | Created, not yet served |
| `served` | new | Due date running |
| `service_failed` | problem | Address problem |
| `nominated` | waiting | Owner named the driver; awaiting the driver's notice |
| `transferred` | closed | Replaced by the driver's notice |
| `disputed` | waiting | OIC review pending |
| `overdue` | problem | Due date passed; reminder sent |
| `court_referral` | legal | Handed to [06](06-court-cases.md) |
| `paid` | good | Closed |
| `withdrawn` | closed | With reason |

### 6.1 Paying
- Within the due date, through the payment simulator (or a recorded receipt) — [07](07-payments-and-simulator.md).
- Full amount only; no partial payments.
- Payment closes the notice, confirms the reporter's reward points ([16](16-citizen-rewards.md))
  and records demerit points ([08](08-demerit-points.md), if enabled).
- **Late payment** is accepted until the matter is **filed in court** (D05-6); after filing, the
  court decides.

### 6.2 Naming the driver (nomination)
- The owner may name the driver **once**, within the due date: name, NIC or licence number, and
  address.
- The owner's notice becomes `transferred`; a **new notice** goes to the driver with a fresh due
  date. The driver cannot nominate someone else; they can pay or dispute.
- **Organisations must nominate** ([04](04-investigation-vehicles-and-people.md) D04-3); if they
  don't, the notice goes overdue as usual.
- A nomination naming someone who can't be identified is rejected by the officer; the owner's
  notice continues.

### 6.3 Disputing
- Grounds: *not my vehicle / false plate*, *vehicle sold or stolen at the time*, *the evidence is
  wrong*, *other* — with an explanation and optional attachments.
- The **OIC reviews within 7 days** (setting):
  - **Upheld** → notice withdrawn; the case outcome is reconsidered (e.g. NFA, or a notice to the
    right person).
  - **Rejected** → reasons recorded; the notice returns to `served` with **7 more days**. The
    addressee can then pay, or let it go to court.
- A second dispute on the same notice is not accepted; the next step is court.

### 6.4 Not responding
- At the due date: status `overdue`, **reminder** sent (post + SMS), **7 more days**.
- After the final date: the system **proposes a court referral**; the **OIC confirms** it
  ([06](06-court-cases.md)).

## 7. Warnings
- A formal warning letter to the addressee; no fine; recorded on the person's and vehicle's
  history.
- Not available for a person or vehicle with an enforcement outcome in the last 12 months
  (repeat-offender rule, [04](04-investigation-vehicles-and-people.md) §7).
- Earns the reporter the small warning reward ([16](16-citizen-rewards.md) D16-4).

## 8. No further action

| Reason code | Meaning |
|---|---|
| `owner_not_traced` | The vehicle or owner couldn't be identified |
| `insufficient_evidence` | Evidence doesn't prove the offence |
| `false_plate` | Plate doesn't belong to the vehicle in the evidence |
| `not_an_offence` | On review, no offence was committed |
| `offender_unavailable` | Abroad, deceased or otherwise unreachable |
| `other` | Free-text reason required |

The reporter sees "Closed — no action possible" ([02](02-reports-and-triage.md) §9).

## 9. Legacy citations
Citations issued before this design have no addressee. They migrate as notices with status kept
(paid / waived → withdrawn / void) and the flag `legacy`; they can't be nominated or disputed and
are never escalated to court ([14](14-data-model-and-migration.md) §6.2).

## 10. Edge cases

| Situation | Rule |
|---|---|
| Owner pays and also nominates | Payment wins; the nomination is ignored and recorded. |
| Payment arrives for a withdrawn notice | Refunded ([07](07-payments-and-simulator.md)). |
| The named driver says it wasn't them | They dispute; if upheld, the case is reconsidered — it doesn't return to the owner automatically. |
| A case has fineable and court-only offences | Court referral for the case (§3). |
| A new report reaches a case with a running notice | Attached as information; the notice is unaffected. |
| The address was wrong and the addressee never knew | `service_failed` path (§5.1); time doesn't run until served. |

## 11. Loopholes this closes

| Loophole | Closed by |
|---|---|
| The officer who investigated also decides | Recommend ≠ decide (§4) |
| Fines with no addressee | Addressee required (§3, §5) |
| No way for the real driver to be fined | Nomination (§6.2) |
| No fair way to challenge a notice | Dispute review (§6.3) |
| Unpaid fines forgotten | Reminder and court referral (§6.4) |
| Time running against someone who was never told | Due date counts from service (§5.1) |
| Warnings for repeat offenders | Repeat-offender rule (§7) |

## 12. Decisions

All decisions agreed on 2026-10-20 as recommended.

| # | Decision | Agreed |
|---|---|---|
| D05-1 | Notice amount when there are several offences | **Sum of the fixed fines** (as today). |
| D05-2 | Time to respond | **14 days from service**, then **7 more days** after the reminder. |
| D05-3 | Service | **Post (deemed served after 3 days) + SMS where possible**; SMS alone isn't service. |
| D05-4 | Warnings | **Minor offences only, and only with no enforcement outcome in 12 months.** |
| D05-5 | Dispute review | **OIC, within 7 days**; one dispute per notice. |
| D05-6 | Late payment | **Accepted until the court filing.** |
| D05-7 | Nomination | **Once per notice**; the driver can't re-nominate; organisations must nominate. |
| D05-8 | Court referral after non-payment | **System proposes, OIC confirms.** |
| D05-9 | Decision time limit | **3 days** after the recommendation. |

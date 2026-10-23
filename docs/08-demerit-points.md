# 08 — Demerit points

**Status:** Agreed (2026-10-20) · **Depends on:** [05](05-outcomes-and-penalty-notices.md), [06](06-court-cases.md) · **Last updated:** 2026-10-20

## 1. Purpose

Sri Lanka has piloted a **driver demerit points** scheme: each offence adds points to a driver's
record, and reaching **24 points** leads to suspension of the licence. It is not yet fully in
force, so E-Vigilance supports it **behind a switch**: off by default, ready to turn on when the
scheme applies nationally. The system **records and flags**; it never suspends a licence itself —
that is the Department of Motor Traffic's decision.

## 2. The switch

- Setting `demeritPoints.enabled` — **off** by default. Only HQ can change it; the change is
  audited.
- While **off**, no points are recorded.
- When turned **on**, points apply to outcomes that become final **from that moment** — never
  retroactively (D08-1).

## 3. Where points come from

- Each offence in the schedule has `demeritPoints` (set by HQ, *values to be confirmed* against
  the official scheme).
- A case with several offences records the **sum** of their points (unlike rewards, which use the
  highest — [16](16-citizen-rewards.md) §5) (D08-2).

## 4. When points are recorded

| Outcome | Points |
|---|---|
| Penalty notice **paid** | Recorded (payment accepts the offence) |
| Court **conviction** | Recorded (or as the court orders) |
| Warning, no further action, withdrawn notice, acquittal | None |
| Refund after withdrawal, acquittal on appeal | Points **removed** |

## 5. Whose record

| Situation | Points go to |
|---|---|
| A driver was named (nomination) or identified | The **driver** |
| The owner pays without naming a driver | The **owner** — paying without nominating accepts responsibility (D08-3) |
| The owner is an **organisation** | No points (organisations have no licence); the organisation must nominate ([05](05-outcomes-and-penalty-notices.md) D05-7). An organisation that pays without nominating is flagged to HQ |

Points are recorded on the **person** record ([04](04-investigation-vehicles-and-people.md)), with
the licence number when known.

## 6. The ledger

| Field | Content |
|---|---|
| `person` | Who |
| `points` | Positive when recorded, negative when removed |
| `offences`, `case`, `notice` / `courtCase` | Why |
| `offenceDate` | Date of the offence |
| `expiresAt` | **24 months after the offence date** (D08-4) |
| `recordedAt`, `recordedBy` | `system` for paid notices; the officer for court results |

A person's **current total** = points from entries not yet expired.

## 7. Thresholds

| Current total | Effect |
|---|---|
| **16 or more** | "Approaching suspension" flag on the person and on new cases; warning letter generated for the station to send (D08-5) |
| **24 or more** | "Suspension threshold reached" flag; **HQ is notified** to refer the driver to the Department of Motor Traffic; the referral is recorded (date, reference) |

Thresholds are settings (*to be confirmed* against the official scheme).

## 8. Visibility

- HQ and the handling station see a person's points and ledger ([10](10-evidence-audit-and-privacy.md)).
- The addressee sees the points for their notice on the notice and on the payment page.
- Reporters never see points.

## 9. Edge cases

| Situation | Rule |
|---|---|
| Two person records merged | Ledgers combined; totals recalculated ([04](04-investigation-vehicles-and-people.md) P2). |
| Switch turned off while points exist | Existing points stay and expire normally; no new points. |
| Appeal reduces the conviction | Points adjusted to match the appeal result. |
| Points recorded for the owner, then the owner proves another driver | Handled through the dispute/withdrawal path; points removed from the owner and recorded on the driver if the driver accepts or is convicted. |

## 10. Loopholes this closes

| Loophole | Closed by |
|---|---|
| Owners avoiding points by staying silent | Paying without nominating takes the points (§5) |
| Companies shielding drivers | Organisations must nominate; paying without nominating is flagged (§5) |
| Points staying after a case is overturned | Removal on refund or acquittal (§4) |
| Retroactive penalties when the scheme starts | Applies only from the moment it is switched on (§2) |

## 11. Decisions

All decisions agreed on 2026-10-20 as recommended.

| # | Decision | Agreed |
|---|---|---|
| D08-1 | Switch behaviour | **Off by default; when on, applies only to outcomes from then on.** |
| D08-2 | Several offences | **Sum of their points.** |
| D08-3 | Owner pays without nominating | **Points go to the owner.** |
| D08-4 | Points expiry | **24 months after the offence date.** |
| D08-5 | Thresholds | **Warning at 16, suspension referral at 24** (settings, to be confirmed). |
| D08-6 | Suspension | **System flags and records the referral; it never suspends a licence itself.** |

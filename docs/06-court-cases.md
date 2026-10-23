# 06 — Court cases

**Status:** Agreed (2026-10-20) · **Depends on:** [05](05-outcomes-and-penalty-notices.md) · **Last updated:** 2026-10-20

## 1. Purpose

Some matters must go before the **Magistrate's Court**: court-only offences, penalty notices that
were never paid, and disputes the addressee wants a court to decide. E-Vigilance does not run the
court; it tracks what the police side does — preparing the case, filing it, attending hearings —
and records the verdict, because the verdict decides demerit points, citizen rewards and the
person's record.

## 2. Current state

Nothing exists today: there is no court path at all.

## 3. How a matter reaches court

| Route | From |
|---|---|
| **Court-only offence** | The OIC decides "court referral" ([05](05-outcomes-and-penalty-notices.md) §3) |
| **Unpaid notice** | Overdue after the reminder; system proposes, OIC confirms ([05](05-outcomes-and-penalty-notices.md) §6.4) |
| **Notice that can't be served** | Address unknown after re-service attempts ([05](05-outcomes-and-penalty-notices.md) §5.1) |
| **Officer's judgment** | The OIC decides court is appropriate even for a fineable offence |

A court case needs an **identified accused** with an address. If the offender is unknown, the
case closes as no further action instead ([05](05-outcomes-and-penalty-notices.md) §8).

## 4. The court case record

| Field | Rules |
|---|---|
| `courtRef` | Internal reference `CR-2026-000057` |
| `case`, `notice` | The case, and the notice if it came from one |
| `accused` | One person per court case (D06-6) |
| `court` | From a configured list of Magistrate's Courts; each station has a default court (D06-1) |
| `courtCaseNumber` | Assigned by the court; entered by the officer at filing |
| `charges` | Offences with legal references, copied from the case |
| `prosecutingOfficer` | Usually the investigating officer |
| `evidenceBundle` | The evidence list with fingerprints (§6) |
| `hearings[]` | Date, what happened, next date |
| `verdict` | §7 |
| `courtFine` | Amount, paid at court, receipt number |
| `appeal` | Reference and result, if any |

## 5. Lifecycle

```
referred ─► prepared ─► filed ─► hearing ─┬─► hearing (postponed) ─┐
                                          │◄───────────────────────┘
                                          └─► verdict ─► closed
referred / prepared ─► withdrawn (OIC or HQ, reason) — e.g. the notice was paid before filing
```

| Status | Family | Who moves it |
|---|---|---|
| `referred` | legal | OIC decision (or confirmed proposal) |
| `prepared` | legal | Officer: charges, summary and evidence bundle ready; **OIC approves filing** |
| `filed` | progress | Officer enters the court case number and first hearing date |
| `hearing` | progress | Officer records each hearing |
| `verdict` | good / closed | Officer records; **OIC confirms** |
| `withdrawn` | closed | OIC or HQ, with a reason |

## 6. The evidence bundle

- A printable list of every piece of evidence on the case: what it is, when it was received, from
  which report, and its **fingerprint** (SHA-256).
- The court may ask for the **original files**. Today the system keeps only the original's
  fingerprint and a compressed copy — **not the original file itself**. For court use that is a
  gap: see D06-4.
- Every time the bundle is generated or a file is downloaded for court, it is logged
  ([10](10-evidence-audit-and-privacy.md)).

## 7. Verdicts and their effects

| Verdict | Effect |
|---|---|
| **Convicted** | Court fine and any other sentence recorded; demerit points recorded ([08](08-demerit-points.md)); reporter's reward **confirmed** ([16](16-citizen-rewards.md)); person history updated; case closes |
| **Acquitted** | Pending reward **reversed**; any related notice withdrawn; case closes |
| **Withdrawn / discharged** | Treated like acquittal for rewards and points |
| **Warrant issued** (accused absent) | Recorded as a hearing outcome, not a verdict; the case stays open |

- Court fines are paid **at court**; the officer records the receipt number. They do not go
  through the payment simulator.
- An **appeal** is recorded with its reference; if the result changes the verdict, the effects
  above are re-applied (points removed, rewards reversed or confirmed).

## 8. Time limits (settings, to be confirmed against the law)

| Step | Default |
|---|---|
| Prepare after referral | 14 days |
| File after preparation is approved | 14 days |
| Record a hearing outcome after the hearing date | 2 days |
| Reminder to the prosecuting officer before a hearing | 3 days before |

The legal limitation period for prosecuting traffic offences must be confirmed; cases approaching
it are flagged to HQ ([09](09-time-limits-and-notifications.md)).

## 9. Edge cases

| Situation | Rule |
|---|---|
| The notice is paid after referral but before filing | Court case withdrawn, notice closed as paid ([05](05-outcomes-and-penalty-notices.md) D05-6). |
| Payment attempted after filing | Not accepted through the simulator; the court decides. |
| The accused pleads guilty at the first hearing | Recorded as a hearing and a conviction in one step. |
| Many postponements | After 5 postponements the case is flagged to HQ. |
| Prosecuting officer transferred | The OIC assigns another officer; hearings stay. |
| Owner and driver both charged | Two court cases, one per accused. |

## 10. Loopholes this closes

| Loophole | Closed by |
|---|---|
| Unpaid fines with no consequence | Court referral path (§3) |
| Rewards and points given on cases the court rejected | Verdict-driven effects (§7) |
| Court cases filed without review | OIC approves filing (§5) |
| Evidence handed to court with no record | Logged evidence bundle with fingerprints (§6) |
| Cases drifting through endless postponements | Postponement flag (§9) |

## 11. Decisions

All decisions agreed on 2026-10-20 as recommended.

| # | Decision | Agreed |
|---|---|---|
| D06-1 | Courts | **A configured list of Magistrate's Courts, with a default court per station.** |
| D06-2 | Filing approval | **OIC approves before filing.** |
| D06-3 | Time limits | **As §8**, confirmed against the law before real use. |
| D06-4 | Keep original evidence files? | **Yes — keep the original file of every evidence item** (in addition to the compressed copy) until the case is closed plus the retention period in [10](10-evidence-audit-and-privacy.md). This changes the current "fingerprint only" behaviour. |
| D06-5 | Verdict recording | **Officer records, OIC confirms.** |
| D06-6 | Several accused | **One court case per accused.** |
| D06-7 | Appeals | **Recorded, and they can change the verdict's effects.** |

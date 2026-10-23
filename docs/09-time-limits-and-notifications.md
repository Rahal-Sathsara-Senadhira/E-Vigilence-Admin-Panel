# 09 — Time limits and notifications

**Status:** Agreed (2026-10-20) · **Depends on:** [02](02-reports-and-triage.md)–[07](07-payments-and-simulator.md), [16](16-citizen-rewards.md) · **Last updated:** 2026-10-20

## 1. Purpose

Principle 5 says *deadlines escalate; nothing is quietly dropped*. This piece collects every time
limit agreed in the other pieces into one table, defines what happens when a limit is missed,
and defines who is told what, through which channel.

## 2. Current state

Built: dispatch alerts (not accepted in 24 h, no action in 72 h) to HQ and station admins, sent
once per breach; in-app notifications with unread count; clean-up of unclaimed uploads after
24 h and of stuck video processing after 2 h. Nothing else is time-limited today.

## 3. How time limits work

- T1. **Calendar time, 24/7.** Police work around the clock; limits count calendar hours/days,
  with no adjustment for weekends or public holidays (D09-1).
- T2. **Every limit is a setting**, editable by HQ, audited. A change applies to items that
  **start after** the change, never retroactively (D09-8).
- T3. **Each breach alerts once** per stage (built pattern), and is shown on the dashboards until
  resolved.
- T4. **Escalation ladder:** at the limit → the responsible person **and** their supervisor;
  at **twice the limit** → HQ (and the division supervisor once that role exists) (D09-2).

## 4. All time limits

### Reports ([02](02-reports-and-triage.md))
| Limit | Default | Responsible | On breach |
|---|---|---|---|
| Triage a P1 report | 2 h | HQ | HQ supervisors alerted |
| Triage a P2/P3 report | 24 h | HQ | HQ supervisors alerted |
| Reporter answers "needs information" | 7 days | Reporter | Report rejected `no_response` |
| Triage lock on an open report | 15 min | HQ user | Lock released |

### Cases ([03](03-cases-and-dispatch.md))
| Limit | Default (P1) | Responsible | On breach |
|---|---|---|---|
| Station accepts a dispatch | 24 h (2 h) | Station | Station + HQ (built) |
| Work starts after dispatch | 72 h (24 h) | Investigating officer | Officer + OIC; HQ at 2× |
| Investigating officer assigned | 24 h after accept / transfer | OIC | OIC; HQ at 2× |
| Recommendation after acceptance | 7 days | Investigating officer | Officer + OIC; HQ at 2× |
| Decision after recommendation | 3 days | OIC (HQ for S2 cases) | OIC; HQ at 2× |

### Penalty notices ([05](05-outcomes-and-penalty-notices.md))
| Limit | Default | Responsible | On breach |
|---|---|---|---|
| Notice posted after decision | 3 days | Station | OIC; HQ at 2× |
| Deemed served after posting | 3 days | — | Response period starts |
| Respond (pay / nominate / dispute) | 14 days from service | Addressee | Reminder; 7 more days |
| Final date after reminder | 7 days | Addressee | Court referral proposed to the OIC |
| Dispute reviewed | 7 days | OIC | OIC; HQ at 2× |
| Re-serve after service failed | 7 days | Investigating officer | OIC; HQ at 2× |

### Court ([06](06-court-cases.md))
| Limit | Default | Responsible | On breach |
|---|---|---|---|
| Prepare after referral | 14 days | Prosecuting officer | Officer + OIC |
| File after approval | 14 days | Prosecuting officer | Officer + OIC; HQ at 2× |
| Reminder before a hearing | 3 days before | — | Reminder to the prosecuting officer |
| Hearing outcome recorded | 2 days after the hearing | Prosecuting officer | Officer + OIC |
| Postponements | 5 | — | HQ flagged |
| Legal limitation period | *to be confirmed* | — | HQ flagged in advance |

### Payments and rewards ([07](07-payments-and-simulator.md), [16](16-citizen-rewards.md))
| Limit | Default | Responsible | On breach |
|---|---|---|---|
| Pending ("bank delay") payment | 24 h | — | Marked failed |
| Recorded receipt reviewed | 3 days | HQ | HQ supervisors |
| Refund approved | 5 days | HQ | HQ supervisors |
| Payout batch | Weekly | HQ | Missed batch flagged |
| Confirmed reward points | 12 months | — | Points expire (citizen warned 30 days before) |

### System (built)
| Limit | Default | Effect |
|---|---|---|
| Unclaimed evidence uploads | 24 h | Deleted |
| Stuck video processing | 2 h | Marked failed |

### Accounts and structure ([01](01-roles-and-permissions.md))
| Condition | Alert |
|---|---|
| Active station with no active OIC | HQ, immediately and daily until fixed |
| Active station with no active officers | HQ (built as a dispatch warning) |

## 5. Who is told, and how

### 5.1 Channels
| Audience | Channels |
|---|---|
| **Staff** (HQ, OIC, officers) | In-app notifications (bell, unread count — built); optional **daily email digest** per user (D09-3) |
| **Citizens** (mobile app) | **Push and in-app** in the mobile app; **SMS** only for "needs information" and failed payouts (D09-4) |
| **Addressees** (owners, drivers) | **Post** for notices, reminders, dispute results and court referral letters; **SMS** for notice number, reminders and payment receipts (D09-5) |

### 5.2 Staff notifications
| Event | Who |
|---|---|
| Report waiting past its triage limit | HQ |
| Station returned a case | HQ (built) |
| Case dispatched to your station | Station officers and OIC |
| Case assigned to you | That officer |
| Recommendation waiting for your decision | OIC (or HQ) |
| Recommendation sent back | Investigating officer |
| Dispute received | OIC |
| Court referral proposed | OIC |
| Hearing in 3 days / outcome missing | Prosecuting officer |
| Payout batch / receipts / refunds waiting | HQ |
| Every time-limit breach (§4) | As listed |

### 5.3 Citizen notifications (mobile app)
Report received · we need more information (with the question) · under review · action taken ·
closed (with the plain-language reason) · reward pending / confirmed / reversed · points expiring ·
payout paid / failed. Never: offender details, station, amounts of fines.

### 5.4 Addressee notifications
Notice issued (post + SMS) · reminder (post + SMS) · nomination accepted / rejected · dispute
result · payment receipt (SMS) · court referral (post).

## 6. Notification rules

- N1. Every notification links to the item it is about.
- N2. **Grouping:** more than 10 similar alerts for the same person within an hour become one
  summary ("12 reports waiting past 24 h") (D09-7).
- N3. Notifications are kept for **90 days** (D09-6); the audit log keeps the underlying events
  permanently.
- N4. A notification never contains more personal data than its recipient's role may see.
- N5. Citizen and addressee messages use plain language and a consistent sender name
  ("Sri Lanka Police — E-Vigilance"), and never include links that ask for passwords or payments
  other than the official payment page.

## 7. Loopholes this closes

| Loophole | Closed by |
|---|---|
| A step that has no deadline stalls forever | Every step has a limit (§4) |
| Breaches noticed only by the person who missed them | Supervisor at the limit, HQ at 2× (T4) |
| Alert floods that people learn to ignore | Once per breach, grouping (T3, N2) |
| Changing a limit to make overdue items disappear | Changes apply only to new items, audited (T2) |
| Notifications leaking personal data | Role-limited content (N4) |
| Phishing look-alikes of police messages | Consistent sender, official payment page only (N5) |

## 8. Decisions

All decisions agreed on 2026-10-20 as recommended.

| # | Decision | Agreed |
|---|---|---|
| D09-1 | Calendar time or working days? | **Calendar time, 24/7**, no holiday adjustment. |
| D09-2 | Escalation | **At the limit: responsible person + supervisor; at 2×: HQ.** |
| D09-3 | Staff channels | **In-app, plus an optional daily email digest.** |
| D09-4 | Citizen channels | **Mobile-app push and in-app; SMS only for needs-information and failed payouts.** |
| D09-5 | Addressee channels | **Post for formal documents, SMS for reminders and receipts.** |
| D09-6 | Notification retention | **90 days.** |
| D09-7 | Grouping threshold | **More than 10 similar alerts in an hour.** |
| D09-8 | Changing limits | **HQ only, audited, not retroactive.** |

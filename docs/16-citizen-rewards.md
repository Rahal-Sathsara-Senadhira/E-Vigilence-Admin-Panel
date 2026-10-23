# 16 — Citizen rewards

**Status:** Agreed (2026-10-20) · **Depends on:** [02](02-reports-and-triage.md), [05](05-outcomes-and-penalty-notices.md), [07](07-payments-and-simulator.md) · **Last updated:** 2026-10-20

## 1. Purpose

Citizens using the **E-Vigilance mobile app** record traffic offences they see on Sri Lankan
roads. When a tip proves **correct** — police take enforcement action on it — the citizen is
**rewarded**. The scheme must encourage honest, useful reports and make false, staged or
vindictive reports pointless.

## 2. What comparable schemes do

| Scheme | Model |
|---|---|
| Delhi Traffic Police — *Traffic Sentinel* (2015, relaunched 2017) | Points per offence type (up to 5 per report), redeemable for prizes |
| Goa Police — *Traffic Sentinel* | Points by offence; every 100 points = Rs 1,000 cash |
| Delhi Traffic Police — *Prahari* (2025) | Monthly earnings with a cap; submissions checked for false reports and personal vendetta |
| India, national proposal (2017) | 10% of the fine to the person who sent the photo |

We use **points per offence, converted to money**, with caps and fraud checks — not a share of
the fine, so the reward doesn't depend on whether or when the offender pays.

## 3. Who can earn

- A citizen with a **verified mobile-app account**: NIC and phone number verified, aged 18 or over.
- One reward account per NIC.
- **Not eligible:** anonymous reports; police staff (any account whose NIC matches a staff
  account); accounts suspended from reporting ([02](02-reports-and-triage.md) §10).

## 4. When a tip counts as correct

| Case result | Reward |
|---|---|
| Decided with a **penalty notice** or **court referral** | Points **earned** (pending) |
| Penalty notice **paid**, or court **convicts** | Points **confirmed** — can be paid out |
| Decided with a **warning** | Small fixed points, confirmed when the warning is issued (D16-4) |
| **No further action**, report **rejected** | No points |
| Notice **withdrawn**, verdict **acquittal**, decision **overturned** | Pending points **reversed**; if already paid out, the amount is recovered from future rewards |

Points move: `pending → confirmed → paid out`, or `pending → reversed`. A citizen sees each
movement on their report, with a plain reason ("action taken", "reward confirmed", "reversed:
the case outcome changed").

## 5. How many points

- Each offence in the offence schedule has **reward points** (set by HQ), suggested by severity:
  **minor 10 · moderate 20 · severe 50**.
- A case with several offences earns the points of its **highest** offence (not the sum), so
  reporters aren't encouraged to list extra offences.
- **Merged reports** ([02](02-reports-and-triage.md) §6.2):
  - the **lead report** — the first one received with usable evidence — earns **100%**;
  - a later report that added **new evidence the case relied on** earns **25%**;
  - plain duplicates earn **nothing**.

## 6. Converting and paying out

| Rule | Default (setting) |
|---|---|
| Conversion | **100 points = Rs 1,000** |
| Minimum payout | 100 confirmed points |
| Monthly cap per citizen | **Rs 10,000** |
| Points expire | **12 months** after confirmation |
| Points-earning reports per citizen per day | **10** (more can be sent, but only the first 10 that day can earn) |

Payout flow:
```
citizen requests payout ─► HQ reviews (fraud checks §7) ─► approved ─► paid ─► reference recorded
                                    └─► rejected (reason)          └─► failed (retry)
```
- Payouts are **simulated** for now, with the same test-mode simulator as fine payments
  ([07](07-payments-and-simulator.md)): the citizen chooses bank transfer or mobile wallet; the
  simulator returns a reference. No real money moves.
- HQ approves payouts in **weekly batches**; each approval is audited.

## 7. Fraud and abuse checks

| Pattern | Detection | Effect |
|---|---|---|
| **Self-reporting** — the reporter is the vehicle's owner or the named driver | Reporter's NIC or phone matches the owner/driver | No reward; the report is still actioned; account flagged |
| **Collusion** — reporter related to the offender | Same address or phone as the owner/driver | No reward; HQ review |
| **Targeting** — the same reporter keeps reporting the same vehicle | 3 or more reports on one plate in 90 days | Rewards on that plate held for HQ review |
| **Fabricated / AI-generated evidence** | Triage rejection `fabricated` | Pending points cancelled, payouts frozen, account reviewed; repeat = permanent exclusion from rewards |
| **Recycled evidence** | Same file fingerprint (hash) already on another report | Second report rejected as duplicate; no reward |
| **Staged offences** | Patterns HQ spots (same people, same place) | HQ can reverse points and exclude the account, with a reason |
| **Bulk farming** | Many low-value reports | Daily earning limit (§6) |

All holds and exclusions record who decided and why; the citizen sees a plain message, never the
detection details.

## 8. What the citizen sees in the mobile app

- Per report: status milestones ([02](02-reports-and-triage.md) §9) and the reward line
  (pending / confirmed / reversed / not eligible).
- Their balance: pending, confirmed, paid out, expiring soon.
- Payout requests and their status.
- **Never**: the offender's identity, the fine amount, the outcome type beyond "action taken".

## 9. What HQ sees

- Reward rules (points per offence, caps, conversion) — editable, audited.
- Payout review queue with each citizen's history and any fraud flags.
- Totals for finance: points issued, confirmed, paid out, reversed — by month, district, offence.

## 10. Edge cases

| Situation | Rule |
|---|---|
| The case is decided after the reporter's account was suspended | Points are not credited while suspended; restored if HQ lifts the suspension. |
| The citizen deletes their account | Unpaid points lapse; paid-out history is kept for audit. |
| Outcome overturned after payout | Amount recovered from future confirmed points; no direct debit. |
| Two citizens send reports one minute apart | The earlier report with usable evidence is the lead (§5). |
| A tip leads to a court case that takes months | Points stay pending until the verdict; they don't expire while pending. |
| An officer's family member reports | Allowed, unless the officer handled the case — then no reward (conflict of interest). |

## 11. Loopholes this closes

| Loophole | Closed by |
|---|---|
| Reporting your own or a friend's vehicle for money | Self-report and collusion checks (§7) |
| Rewards paid on cases later thrown out | Confirmation only after payment or conviction; reversals (§4) |
| Sending fake or AI-made videos for money | Cancelled points, frozen payouts, exclusion (§7) |
| Farming many small reports | Daily earning limit, monthly cap (§6) |
| Several people claiming one incident | Lead-report rule (§5) |
| Rewards that depend on whether the offender pays | Points per offence, not a share of the fine (§2) |

## 12. Legal and funding note

A real cash reward needs legal authority and a funding source (e.g. a gazette notification and a
budget line). Until those exist, the system runs the scheme in **simulation**: points and payouts
work end to end, no money moves. Tax on rewards is out of scope.

## 13. Decisions

All decisions agreed on 2026-10-20 as recommended.

| # | Decision | Agreed |
|---|---|---|
| D16-1 | Points per offence (converted to money), or a percentage of the fine? | **Points per offence.** |
| D16-2 | When are points paid out? | **Only after the notice is paid or the court convicts.** |
| D16-3 | Suggested points | **Minor 10 · moderate 20 · severe 50**, editable per offence. |
| D16-4 | Do warnings earn points? | **Yes, 5 points** — the tip was correct even if the outcome was mild. |
| D16-5 | Conversion and caps | **100 points = Rs 1,000; Rs 10,000 per month; 10 earning reports per day; points expire after 12 months.** |
| D16-6 | Merged reports | **Lead report 100%, report adding relied-on evidence 25%, plain duplicates 0.** |
| D16-7 | Eligibility | **Verified NIC and phone, 18+, not police staff, not anonymous.** |
| D16-8 | Payout approval | **HQ, weekly batches.** |
| D16-9 | Public leaderboard in the app? | **No** for now — it rewards volume over accuracy and exposes reporters. |
| D16-10 | Payout method | **Simulated** bank transfer / mobile wallet until a real channel is approved. |

## 14. Sources

- [Delhi Police relaunches Traffic Sentinel app to reward citizens (Millennium Post)](https://www.millenniumpost.in/delhi/delhi-252008)
- [Delhi Traffic Police Prahari app — citizens can earn monthly (Cartoq)](https://svb1.cartoq.com/car-life/delhi-traffic-police-launches-prahari-app-citizens-can-earn-monthly-reporting-traffic-violations)
- [Cops invite citizens to be traffic watchdogs — Goa (Herald Goa)](https://www.heraldgoa.in/goa/cops-invite-citizens-to-be-traffic-watchdogs/192033)
- [Click a photo of a wrongly parked car and earn a reward (Rushlane)](https://www.rushlane.com/click-a-photo-of-wrongly-parked-car-12256911.html)
- [Delhi Traffic Police reward points scheme (The Automotive India forum)](https://theautomotiveindia.com/forums/threads/delhi-traffic-polices-upcoming-reward-points-scheme.22355)

# 12 — Dashboards and reports

**Status:** Agreed (2026-10-21) · **Depends on:** [02](02-reports-and-triage.md)–[09](09-time-limits-and-notifications.md), [13](13-design-system.md), [16](16-citizen-rewards.md) · **Last updated:** 2026-10-21

## 1. Purpose

A dashboard answers one question for one role: **"What needs my attention now, and is the work
getting done?"** It is a starting point for action, not a wall of numbers. Every number on it
has a fixed definition (§6) and opens the list of records it counts.

This piece defines the dashboards for each role, the management reports, how each figure is
calculated, and the chart colour rules that finish the design system ([13](13-design-system.md) §3.6).

## 2. Current state (as of 2026-10-20)

One dashboard for every role (`Dashboard.jsx`, `GET /api/dashboard`):
- Range picker (7 / 14 / 30 / 90 days / all time).
- Tiles: total, open, in review, resolved, unread notifications; all-time violations, stations,
  users.
- Charts: violations per day (line), violations by category (bar).
- Lists: latest violations, latest report runs.

Problems:
- The figures count **old statuses** (`open`, `in_review`, `resolved`) that no longer match the
  agreed model of reports → cases → outcomes ([02](02-reports-and-triage.md)–[05](05-outcomes-and-penalty-notices.md)).
- Nothing shows **overdue work**, although principle 5 says deadlines escalate ([09](09-time-limits-and-notifications.md)).
- "Stations" and "Users" totals don't help anyone act.
- Tiles don't open the records they count, so a number can't be checked.
- The same dashboard is shown to HQ and to a station officer.

## 3. Principles

- D1. **One dashboard per role**, built around that role's work queue.
- D2. **Action first:** the top row is "needs attention" (overdue, waiting for me), then
  throughput, then trends.
- D3. **Every figure is clickable** and opens the filtered list it counts. If the list and the
  number disagree, it's a bug.
- D4. **Every figure has one written definition** (§6), shown in a tooltip ("What does this
  count?").
- D5. **Scope follows permissions** ([01](01-roles-and-permissions.md)): a station sees its own
  records; HQ sees all; nobody sees a figure built from data they couldn't open.
- D6. **No personal data on dashboards** — counts, rates and record numbers only.
- D7. **Times in Sri Lanka time (UTC+05:30)**; "today" and "this week" (Monday start) follow it.

## 4. Dashboards by role

### 4.1 HQ — "Command Center"

**Row 1 — Needs attention** (stat tiles, red marker when above zero)
| Tile | Counts |
|---|---|
| Reports waiting for triage | `pending` reports; sub-line: *n past their limit* |
| P1 reports waiting | P1 reports not yet triaged |
| Dispatches not accepted | Cases `dispatched` past 24 h (P1: 2 h) |
| Returned to HQ | Cases `returned`, waiting for re-dispatch |
| Overdue at 2× limit | All items escalated to HQ ([09](09-time-limits-and-notifications.md) T4) |
| Money waiting | Recorded receipts to review + refunds to approve + payout batch due |
| Integrity / audit alerts | Evidence integrity failures, audit-chain breaks ([10](10-evidence-audit-and-privacy.md)) |

**Row 2 — Throughput** (selected period vs the previous one of the same length)
Reports received · triaged · accepted as cases · notices issued · notices paid · court cases
filed · reward points confirmed.

**Row 3 — Charts**
| Chart | Form |
|---|---|
| Reports received per day, by channel (app / walk-in / hotline / WhatsApp / officer) | Stacked bars; top 3 channels coloured, the rest "Other" |
| Triage outcome | 100 % bar: accepted / merged / needs info / rejected |
| Case pipeline now | Horizontal bars, one per case state, in workflow order |
| Top 10 offences (accepted cases) | Horizontal bars, single hue |
| Stations — on-time acceptance | Ranked table (§4.4) with bar-in-cell |
| Map — open cases | Clustered points, coloured by priority |

**Row 4 — Lists:** oldest 10 overdue items · latest 10 returned cases.

### 4.2 Station OIC — "My Station"
**Needs attention:** dispatches to accept · cases without an investigating officer · recommendations
waiting for my decision · disputes to review · notices to post · court items due this week ·
receipts to record.
**Throughput:** accepted · decided · notices paid · court outcomes — this period vs the last.
**Charts:** cases by state (bars, workflow order); cases per officer (open vs overdue); offences in
my area (top 10).
**Lists:** my overdue items, oldest first.

### 4.3 Station officer — "My Work"
Tiles: cases assigned to me · overdue · hearings in the next 7 days · recommendations sent back to
me. A single list of my cases sorted by due date. No charts — an officer needs a queue, not trends
(D12-3).

### 4.4 Division view (when the `division_admin` role is added — [01](01-roles-and-permissions.md))
The HQ dashboard filtered to one division, plus a **station comparison table**: open cases,
on-time acceptance %, median days to decision, notices paid %, overdue count. Sorted by overdue
count; no league-table colours (red/green) on people or stations (D12-5).

### 4.5 Dev
No operational dashboard. A **system health** page: sync job last run (mobile app import), job
failures, queue lengths, storage used, video processing backlog, sign-in failures. No personal
data and no case figures ([01](01-roles-and-permissions.md)).

## 5. Filters

One row above the charts, applied to every tile and chart on the page:
- **Period:** today · 7 days · 30 days · this month · last month · custom (max 24 months). Default
  30 days (D12-2). "All time" is removed — it hides trends and is slow.
- **Division** and **station** (HQ only; stations only within the chosen division).
- **Channel** and **priority**.

"Needs attention" tiles ignore the period — overdue work counts whenever it started. The
filter state is kept in the URL so a view can be shared and bookmarked.

## 6. Definitions

Each figure is computed from the records themselves, never from a separately stored counter.

| Figure | Definition |
|---|---|
| Reports received | Reports whose `receivedAt` is in the period, from any channel; merged duplicates counted once per original submission |
| Triaged | Reports whose triage decision time is in the period |
| Acceptance rate | Accepted ÷ (accepted + rejected) for reports triaged in the period; "needs info" and merged excluded |
| Median time to triage | From `receivedAt` to the triage decision, for reports triaged in the period |
| On-time acceptance | Dispatches accepted within the limit ÷ dispatches made in the period |
| Median days to decision | From case acceptance to the OIC/HQ decision, for cases decided in the period |
| Notices issued / paid | Notices whose issue / payment time is in the period; refunded payments not counted as paid |
| Payment rate | Notices paid within their response period ÷ notices whose response period ended in the period |
| Court filed / outcomes | Court cases filed / with a verdict recorded in the period |
| Collected (Rs) | Succeeded payments minus refunds, by `receivedAt`; **simulator payments shown separately and labelled "TEST"** (D12-6) |
| Rewards confirmed / paid out | Reward ledger lines confirmed / payouts succeeded in the period ([16](16-citizen-rewards.md)) |
| Overdue | Items past their time limit now ([09](09-time-limits-and-notifications.md) §4) |

**Change vs previous period** is shown as a signed difference and %, with an arrow; it is
coloured only when "up" is unambiguously good or bad for that figure (e.g. overdue up = danger),
otherwise neutral ink.

## 7. Management reports

Generated as PDF and CSV; CSV follows the export rules in [10](10-evidence-audit-and-privacy.md) §5.4.

| Report | Who | When |
|---|---|---|
| Daily operations summary | HQ | Every morning, 06:00, for the previous day |
| Weekly station performance | HQ, each OIC (own station) | Monday 06:00 |
| Monthly enforcement report (offences, outcomes, collection, court) | HQ | 1st of the month |
| Daily payment reconciliation | HQ | Daily ([07](07-payments-and-simulator.md) §10) |
| Monthly reward summary (points, payouts, fraud flags) | HQ | 1st of the month |
| Overdue items | HQ, OIC | On demand |

Reports run as background jobs; each run is recorded (who/what, period, filters, file
fingerprint) and listed under "Report runs" — replacing today's list. A report is generated from
the same definitions as §6, so it always matches the dashboard (D12-7).

## 8. Chart colours

Validated with the data-visualisation palette checker (lightness band, chroma, colour-blind
separation, normal-vision separation, contrast) in both themes, against chart surfaces
**#FFFFFF** (light) and **#101C2E** (dark). The three colours pass every check in both themes
(colour-blind separation ≥ 9 in both).

### 8.1 Which colour job a chart has
| Job | Use | Colours |
|---|---|---|
| **Magnitude of one measure** (top offences, cases per station) | One hue | `chart-1` (primary blue) for every bar |
| **Identity**, up to 3 series (channels, this vs other) | Categorical, fixed order | §8.2; series 4+ fold into "Other" in `chart-other` |
| **This period vs previous** | Current + reference | Current `chart-1`; previous `chart-other` (gray), never a second hue |
| **Ordered levels** (heat map, map density) | Sequential, one hue | §8.3 |
| **Above / below a target** | Diverging | Blue ↔ orange with a gray midpoint (§8.4) |
| **Workflow state** | Status families | §8.5 |

### 8.2 Categorical (fixed order, never cycled)
| Slot | Light | Dark |
|---|---|---|
| `chart-1` | #1D6FA5 | #2470AE |
| `chart-2` | #D9661C | #CC6826 |
| `chart-3` | #A066DD | #A978E6 |
| `chart-other` | #8796A8 | #9AA3AF |

`chart-other` is deliberately gray: it fails only the "reads as a colour" check, which is the
point. A series keeps its slot when filters change. Channel colours are fixed: **mobile app =
`chart-1`**, walk-in = `chart-2`, hotline/WhatsApp = `chart-3`, the rest "Other".

### 8.3 Sequential (blue, light → dark)
| Step | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Light | #8CBDE2 | #5FA0D2 | #3A86C0 | #1D6FA5 | #155683 | #0E3D5F |
| Dark | #1F5584 | #2B6FA6 | #3F8CC6 | #5EA8DE | #8DC4EB | #C4E2F5 |

In dark mode, **more = lighter**.

### 8.4 Diverging
`chart-1` blue (better than target) ↔ `chart-2` orange (worse), midpoint gray (light #E6EAEF,
dark #2A3A50). Never red/green — those are reserved for status.

### 8.5 Status families in charts
The seven status families ([13](13-design-system.md) §3.4) **are not a chart palette**: tested
together, teal (legal), slate (closed) and green (good) are too close to tell apart, and amber
fails contrast on white. So:
- A **workflow-state chart** uses horizontal bars in **one hue** (`chart-1`), one bar per state in
  workflow order, each labelled with the state's status **pill** — the pill carries the colour,
  the bar carries the number.
- Status colours appear in charts only as **alerts** (an overdue bar in `danger`, with an icon and
  label).

### 8.6 Mark rules
Bars ≤ 24 px thick, 4 px rounded data end, 2 px surface gap between stacked segments; lines 2 px;
points ≥ 8 px. Gridlines `line`, axis text `muted`; values and labels in ink, never in the series
colour. A legend for ≥ 2 series, plus direct labels for ≤ 3. One y-axis only. Every chart has a
hover tooltip and a **"View as table"** toggle.

## 9. Performance

- Dashboard figures are calculated by the database (aggregations on indexed fields), cached for
  **60 seconds** per role/scope/filter combination (D12-4).
- "Needs attention" tiles are not cached longer than 60 s, so a completed task disappears quickly.
- A dashboard request must answer in under 1 second at 1 million reports; the build plan
  ([15](15-build-plan.md)) includes a load test.

## 10. Loopholes this closes

| Loophole | Closed by |
|---|---|
| Overdue work invisible until someone complains | "Needs attention" row, at the top (§4) |
| A number nobody can check | Every figure opens its list (D3); written definitions (§6) |
| Figures that differ between the dashboard and a report | One set of definitions for both (§7) |
| Station staff seeing other stations' figures | Scope follows permissions (D5) |
| Test-mode money reported as real collection | Simulator payments separate and labelled "TEST" (§6) |
| Charts unreadable for colour-blind staff | Validated palette, labels, table view (§8) |
| Ranking officers by colour, encouraging quota behaviour | No red/green league tables (§4.4) |

## 11. Decisions

All decisions agreed on 2026-10-21 as recommended.

| # | Decision | Agreed |
|---|---|---|
| D12-1 | Separate dashboards per role | **Yes — HQ Command Center, OIC My Station, Officer My Work, Dev System health.** |
| D12-2 | Default period; remove "all time" | **30 days; replace "all time" with custom ranges up to 24 months.** |
| D12-3 | Charts for station officers | **None — a work queue only.** |
| D12-4 | Freshness | **Live database figures, cached 60 seconds.** |
| D12-5 | Station/officer comparisons | **Tables sorted by overdue work, no red/green ranking colours; no officer comparisons outside their own station.** |
| D12-6 | Simulator money in totals | **Shown separately and labelled "TEST"; excluded from real collection figures.** |
| D12-7 | Scheduled reports | **As §7, PDF + CSV, generated from the dashboard definitions.** |
| D12-8 | Chart colours | **As §8 (validated in light and dark); status families not used as a chart palette.** |

# 18 — New frontend: plan

**Status:** Agreed (2026-10-23) · **Depends on:** [12](12-dashboards-and-reports.md),
[13](13-design-system.md), [19](19-new-backend-plan.md), [20](20-roles-v2.md) · **Last updated:**
2026-10-23

## 1. Purpose

Build a new staff interface for E-Vigilence from scratch in `New Frontend/`, with a completely
new look and a better way of working. It talks only to the new backend (`New Backend/`,
[19](19-new-backend-plan.md)).

| Left untouched | Why |
|---|---|
| `Frontend/` (the original frontend) | Runs the current system until go-live |
| `apps/web` (the earlier rebuild) | Kept for reference |

Nothing is copied from either: no components, styles or page layouts. What carries over is the
agreed business (docs 02–17, roles in [20](20-roles-v2.md)) and the brand colours from the logo.

## 2. What we fix in the current look

- **Page hopping.** Lists and records are separate pages; triaging 200 reports a day means
  hundreds of "open, back, open".
- **Everything looks equally important.** The one thing to do next is a button lost in a side
  column.
- **No sense of progress.** A status badge says where a record is, not what came before, what
  comes next or how long is left.
- **No fast way around.** No search by plate or record number, no keyboard use.
- **Generic.** It could be any admin template.

## 3. Goals

| # | Goal | How we will know |
|---|---|---|
| G1 | **Faster daily work** | Triage one report in under 30 seconds without leaving the queue; open any record by its number in two keystrokes |
| G2 | **Always clear what to do next** | Every record shows its one main next action and the time left, without scrolling |
| G3 | **Professional and distinctive** | Reads as an official, modern police system, not a template |
| G4 | **Responsive** | Every screen works from a 360 px phone to a 1920 px wall display (§6) |
| G5 | **Accessible** | WCAG 2.1 AA; everything can be done with the keyboard; light and dark themes |
| G6 | **Fast** | First screen under 2.5 s on an ordinary office laptop; first download under 250 kB compressed |

## 4. Fixed decisions (2026-10-23)

| Topic | Decision |
|---|---|
| Where | `New Frontend/`, a standalone npm project |
| Language | JavaScript (React with JSX), with JSDoc types checked by the TypeScript compiler |
| Styling | **Tailwind CSS**, written from scratch with our own tokens and components |
| Interface language | English only |
| Access | Staff use the system in a web browser on whatever device they have, so every screen must be responsive |
| Backend | `New Backend/` only |

## 5. Visual direction — "Operations console"

Calm, precise and dense where it needs to be, like the tools used in control rooms. The interface
stays quiet; colour is kept for status and attention.

- **Frame:** a slim navy icon rail (64 px) on the left, with labels on hover and a pinned
  expanded mode. Navy (from the logo) is the brand anchor.
- **Work area:** off-white canvas, white panels, hairline borders, almost no shadow. Queues use a
  **split view**: list on the left, open record on the right.
- **Colour:** neutral greys for the interface. Shield blue only for actions and focus, signal
  orange only for "look here" (overdue, waiting for you), and status colours for states.
- **Type:** **IBM Plex Sans** for text, **IBM Plex Mono** for plates, record numbers and money.
- **Density:** comfortable by default; compact mode for HQ desks with a mouse.
- **Motion:** short and functional (150–200 ms); off when the user prefers reduced motion.
- **Dashboard wall mode:** full screen, dark, large figures, for the operations room.

### 5.1 Starting palette (checked for contrast on the design system page before use)

| Token | Light | Dark | Use |
|---|---|---|---|
| `rail` | `#0C3C60` | `#081A2B` | Icon rail (logo navy) |
| `canvas` | `#F6F7F9` | `#0D1117` | Page background |
| `panel` | `#FFFFFF` | `#151B23` | Panels, lists, dialogs |
| `sunken` | `#EEF0F3` | `#1C232D` | Table headers, selected rows, inputs |
| `border` | `#E1E4E8` | `#2A323D` | Hairlines |
| `text` | `#111827` | `#E6EAF0` | Main text |
| `text-muted` | `#5B6472` | `#97A1AF` | Labels, secondary text |
| `action` | `#1A6DB0` | `#4C9BE0` | Buttons, links, focus |
| `attention` | `#E8681A` | `#F08A45` | Overdue, waiting for you; never large areas |
| Status families | new, in progress, waiting, good, legal, closed, problem — tuned to these surfaces | | |

## 6. Responsive design

### 6.1 Approach

**Phone-first.** Each screen is designed at phone width first; larger screens get more columns,
not bigger cards.

| Size | Width | Layout |
|---|---|---|
| Phone | under 640 px | Bottom tab bar; one column; a list, then the record as a full page |
| Tablet | 640–1023 px | Collapsed icon rail; one pane at a time; two-column forms |
| Laptop | 1024–1439 px | Icon rail; list and record side by side |
| Desktop | 1440 px and up | Rail can be pinned open; a third column for evidence or timeline |
| Wall | 1920 px and up | Dashboard wall mode |

### 6.2 How each pattern adapts

| Pattern | Phone | Tablet | Laptop and up |
|---|---|---|---|
| Navigation | Bottom tabs (4) + "More" | Icon rail | Icon rail, expandable |
| Queues | List, then record as a full page | Same as phone | Side by side |
| Tables | Each row becomes a card with its 3 most important fields | Less important columns hidden | Full table; user chooses columns |
| Filters | "Filters" button opens a sheet | Chips that wrap | One row of chips |
| Action forms | Full-screen sheet | Sheet from the right | Sheet from the right |
| Confirmations | Sheet from the bottom | Centred dialog | Centred dialog |
| Record header | Number, status, time left, then a full-width next-action button | One row | One row, actions on the right |
| Evidence viewer | Swipe, pinch to zoom | Same | Arrow keys, details alongside |
| Command palette | Full screen | Centred box | Centred box |

### 6.3 Rules

- **Components respond to their own width (container queries).** The same card must work in a
  narrow list and on a full page.
- **Touch is detected separately from width.** Touch screens always get 44 px tap targets;
  compact density is offered only with a mouse.
- **Phones:** layouts handle the browser bar appearing and disappearing, and the notch; keyboards
  never hide the submit button.
- **200 % zoom and 320 px width** still work (WCAG reflow).
- **Checked at** 360, 390, 768, 1024, 1280, 1440 and 1920 px, phone landscape, and both themes.
  Automated screenshots at these widths run on every change.

## 7. Ways of working (UX patterns)

| Pattern | What it is |
|---|---|
| **Inbox** | One queue of everything waiting for me, grouped by type and sorted by time left. The home page for every working role. |
| **Split view** | List and record side by side. `J`/`K` move, `Enter` opens full page, `Esc` closes. The list keeps its place after an action. |
| **Record header** | Number, status, priority, **time left** (turns orange, then red) and the **one main next action**. Other actions in a "More" menu. |
| **Lifecycle bar** | A thin step bar showing the record's path: done, current, next. |
| **Side sheet** | Actions with a form open in a sheet, so the record stays visible. Plain dialogs only for confirmations. |
| **Command palette** | `Ctrl+K`: jump to any plate, report, case or notice number; run actions on the open record. |
| **Filter bar** | Saved views (tabs), search, filter chips. Filters live in the URL so views can be shared. |
| **Evidence viewer** | Full-screen image or video with metadata, fingerprint and custody; next/previous. |
| **Timeline** | Who did what and when, newest first, with filters. |
| **Empty, loading, error** | Skeletons in the real layout; empty states that say why and what to do next; errors that say how to fix them. |

Content rules from [13](13-design-system.md) §8 still apply: Sri Lanka time, `18 Oct 2026, 08:15`,
`Rs 1,500`, plates `WP CAB-1234` in mono, sentence case, no emoji, no exclamation marks.

### 7.1 How each role uses the panel (agreed 2026-10-23)

| Role | Works from | Lands on | Menu |
|---|---|---|---|
| System administrator | IT office desktop | System health | System health · Accounts (administrators) · System settings |
| HQ administrator | HQ desk | Admin overview: locked accounts, stations without an OIC, unverified stations | Overview · Accounts · Divisions & stations · Offence schedule · Time limits · Reward rules · Audit log |
| HQ operator | HQ desk, large screen | Inbox: triage queue | Inbox · Reports · Cases · New report · Dashboard |
| HQ supervisor | HQ desk | Inbox: escalated decisions, disputed jurisdiction, withdrawals | Inbox · Dashboard · Reports · Cases · Notices · Audit log |
| Finance officer | Accounts branch | Inbox: receipts to review, refunds, payouts | Inbox · Payments · Refunds · Reward payouts · Reconciliation · Dashboard |
| Auditor | Anywhere | Audit log ("Read-only" badge always shown) | Audit log · Reports · Cases · Notices · Payments · Dashboard |
| Executive viewer | Office or operations-room wall | National dashboard | Dashboard (wall mode) · Management reports |
| Division supervisor | Division office | Division dashboard + Inbox | Inbox · Dashboard · Cases · Notices · Stations · Officers · Audit log |
| Station OIC | Station PC, sometimes phone | My station: Inbox + station figures | Inbox · Dashboard · Reports · Cases · Notices · Court · Officers · Station profile |
| Traffic officer | **Phone in the field**, station PC | My work: my cases by deadline | Phone: My work · Search · Add · Me. Desktop: My work · Reports · Cases · Notices |
| Station clerk | Station front desk | Desk inbox: notices to post, returned letters, receipts | Inbox · New report · Notices · Payments · Reports |

Everyone has: `Ctrl+K` search (only what they may open), notifications, theme switch, and "Me"
(profile, password, two-step sign-in, signed-in devices).

## 8. Screens

| Area | Screens | Roles ([20](20-roles-v2.md)) |
|---|---|---|
| Sign-in | Sign in, two-step code, set up two-step sign-in, forced password change, change password | All |
| Home | Inbox; dashboards: national, division, station, my work; system health | Per role |
| Reports | Triage queue, report record, new report | HQ operator, HQ supervisor, station roles |
| Cases | Case queues, case record, vehicle record, person record | HQ, division, station roles |
| Notices | Notice queues, notice record, outbox | HQ supervisor, finance, division, station roles |
| Payments, court, rewards | As those backend phases are built | Per doc 20 |
| Administration | Accounts, divisions and stations (with area map), offence schedule, time limits, audit log | HQ administrator, OIC (own station), auditor |
| Design system | `/design` — tokens, components and sample screens in both themes | Team only |

## 9. Technical approach

| Area | Choice | Why |
|---|---|---|
| Build | Vite, React 19 | Already in the folder |
| Routing | React Router 7, one lazy-loaded bundle per feature | Small first download (G6) |
| Server data | TanStack Query | Caching, retries, background refresh of queues |
| Tables | TanStack Table (headless) | Sorting, column choice, virtual scrolling |
| Forms | React Hook Form + zod | Field errors next to the field; the backend's field errors shown the same way |
| Styling | Tailwind CSS 4, tokens as CSS variables | Consistent and fast to build |
| Accessible primitives | Radix UI (dialog, menu, popover, tabs, tooltip), styled by us | Correct keyboard and screen-reader behaviour |
| Command palette | `cmdk` | Small, keyboard-first |
| Icons | Lucide | One consistent stroke style |
| Charts | visx | Full control to follow [12](12-dashboards-and-reports.md) §8 |
| Maps | MapLibre GL with OpenStreetMap tiles | Station areas and case maps, no paid key |
| Fake API for development | MSW | Screens built and tested before an endpoint exists |
| Tests | Vitest + Testing Library; Playwright for main flows and screenshots; axe for accessibility | Each phase ships with its checks |

## 10. File structure

Organised by **business area (feature)**, not by file type.

```
New Frontend/
├─ index.html · package.json · jsconfig.json · vite.config.js · eslint.config.js
├─ public/                     logo, favicons, fonts
├─ e2e/                        Playwright flows + screenshots at each width
└─ src/
   ├─ main.jsx                 entry point: starts the app, nothing else
   ├─ app/                     wiring
   │  ├─ providers.jsx         query client, theme, session, toasts
   │  ├─ router.jsx            all routes, one lazy bundle per feature
   │  └─ layouts/              AppLayout, AuthLayout, Rail, TopBar, BottomTabs
   ├─ ui/                      design system: looks only, no business knowledge
   │  ├─ tokens/               colours, type, spacing, radius, motion
   │  ├─ primitives/           Button, Input, Select, Checkbox, Badge, Avatar…
   │  ├─ overlays/             Dialog, Sheet, Menu, Popover, Tooltip, Toast
   │  ├─ data/                 DataTable, FilterBar, Pagination, EmptyState, Skeleton
   │  └─ layout/               Page, SplitView, Panel, Stack
   ├─ domain/                  small business-aware pieces used by many features
   │  ├─ Plate.jsx · Money.jsx · DateTime.jsx · OffenceList.jsx · StatusBadge.jsx
   │  ├─ RecordHeader.jsx · LifecycleBar.jsx · DeadlineClock.jsx · Timeline.jsx
   │  └─ evidence-viewer/
   ├─ features/                one folder per business area
   │  ├─ auth/  inbox/  dashboard/  reports/  cases/  notices/  people/
   │  ├─ admin/                accounts, divisions, stations, offences, time limits, audit
   │  ├─ system/  search/  design-system/
   ├─ lib/                     API client, session, permissions, formatting, hooks
   ├─ styles/global.css
   └─ test/                    test set-up, MSW fake responses
```

Inside every feature (example `cases/`):

```
features/cases/
├─ index.js        the only file other features may import
├─ routes.jsx      this feature's pages and URLs
├─ api.js          data fetching and actions (TanStack Query)
├─ pages/          CaseQueuePage.jsx, CaseRecordPage.jsx
├─ components/     CaseListItem.jsx, CasePeoplePanel.jsx…
├─ actions/        one file per action sheet: DispatchSheet.jsx, RecommendSheet.jsx…
└─ lib/            helpers only about cases
```

**Rules (checked by lint):**

1. `ui/` never imports from `domain/`, `features/` or the API — it can be restyled without
   touching business logic.
2. `domain/` may use `ui/`, never `features/`.
3. A feature imports another feature only through its `index.js`.
4. Short import paths: `@/ui/…`, `@/domain/…`, `@/features/…`, `@/lib/…`.
5. Naming: folders lowercase with hyphens; components `PascalCase.jsx`; hooks `useSomething.js`.
6. Tests sit next to the file they test.
7. The screen never decides permissions itself: menus come from the user's permissions, and
   record actions from the record's `can` (sent by the backend).

## 11. Other conventions

| Topic | Rule |
|---|---|
| Screen state | Filters, tabs, search and the open record live in the URL. Server data is cached by TanStack Query. Almost no other global state. |
| Errors | Every API error shown in plain words; losing the network shows a banner and keeps form input. |
| Browsers | Last 2 versions of Chrome, Edge and Firefox; Safari on iOS 16+; Chrome on Android 10+. |
| Performance | First download under 250 kB compressed; each feature loaded when opened; long lists virtualised. |
| Testing | Component tests for `ui/` and `domain/`; one Playwright flow per main task; automatic accessibility check on every page. |

## 12. How we build it

The frontend is built phase by phase with the backend (phases N0–N11 in
[19](19-new-backend-plan.md) §9). Before the first screens:

1. **Wireframes** of five key screens (triage queue, case record, officer's "My work" on a phone,
   national dashboard, notice record), checked with people who do the work where possible.
2. **Design system page** (`/design`): tokens and components built and checked in both themes and
   at every width before any page uses them.

## 13. Decisions

| # | Decision | Agreed |
|---|---|---|
| D18-1 | Build in `New Frontend/`; `Frontend/` and `apps/web` untouched | **Yes** (2026-10-23) |
| D18-2 | JavaScript, Tailwind, English only | **Yes** (2026-10-23) |
| D18-3 | Visual direction "Operations console" | **Yes** (2026-10-23) |
| D18-4 | IBM Plex Sans and Plex Mono | **Yes** (2026-10-23) |
| D18-5 | Keep the logo colours as the brand anchor | **Yes** (2026-10-23) |
| D18-6 | Split-view queues, command palette and keyboard shortcuts | **Yes** (2026-10-23) |
| D18-7 | Responsive rules in §6 | **Yes** (2026-10-23) |
| D18-8 | File structure and rules in §10 | **Yes** (2026-10-23) |

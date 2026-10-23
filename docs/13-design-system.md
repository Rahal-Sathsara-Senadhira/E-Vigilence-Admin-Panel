# 13 — Design system

**Status:** Agreed (2026-10-20) · **Depends on:** — · **Last updated:** 2026-10-20

## 1. Purpose

Give E-Vigilance one consistent, professional look that fits a police service: calm, serious,
easy to read for long shifts, and clear about what needs attention. Every page uses the same
tokens, components and rules.

Today the app mixes an orange-tinted sidebar, a solid blue top bar, grey page backgrounds, large
extra-bold page titles, emoji in messages, and older pages with hard-coded slate colours. This
document replaces all of that.

## 2. Brand — derived from the logo

The logo (`Frontend/public/logo.svg`: an eye with a shield and an upward arrow) uses:

| Logo colour | Hex | Role in the system |
|---|---|---|
| Deep navy | `#0C3C60` | Authority — the application frame |
| Shield blue | `#2484C0` | Brand blue — illustrations and large graphics only (4.1:1 on white, too light for text) |
| Signal orange | `#F07824` | Brand accent — used sparingly to draw the eye |
| Light blue | `#9CCCE4` | Illustration only |
| Rust | `#903C18` | Not used in the UI |

**Character:** navy gives authority, blue means "you can act here", orange means "look here".
Orange is a highlight, never a background for large areas.

## 3. Colour tokens

All tokens live as CSS variables in `Frontend/src/index.css` (light on `:root`, dark on `.dark`)
and are mapped to Tailwind class names in `tailwind.config.js`. Components must use tokens, never
raw hex values or Tailwind palette colours like `slate-300`.

### 3.1 Frame and brand

| Token | Light | Dark | Use |
|---|---|---|---|
| `frame` | `#0B2540` | `#07182A` | Sidebar background |
| `frame-active` | `#0C3C60` | `#0E2E4C` | Selected sidebar item background |
| `frame-ink` | `#FFFFFF` | `#FFFFFF` | Selected sidebar text |
| `frame-muted` | `#B8C7D6` | `#9FB2C6` | Unselected sidebar text and icons |
| `primary` | `#1D6FA5` | `#4BA3DC` | Buttons, links, focus, selected controls |
| `primary-hover` | `#175C8A` | `#6BB5E4` | Hover state of primary |
| `brand-blue` | `#2484C0` | `#2484C0` | Logo-matched graphics only |
| `accent` | `#F07824` | `#F59A57` | Active-item marker, attention highlights |
| `accent-ink` | `#B4500F` | `#F59A57` | Orange when used as text |

### 3.2 Neutrals

| Token | Light | Dark | Use |
|---|---|---|---|
| `canvas` | `#F4F6F9` | `#0A1422` | Page background |
| `surface` | `#FFFFFF` | `#101C2E` | Cards, tables, dialogs, top bar |
| `raised` | `#EEF2F6` | `#172638` | Hover rows, table headers, inputs on surface |
| `line` | `#DCE3EB` | `#24364D` | Borders and dividers |
| `ink` | `#0F1E2E` | `#E7EDF4` | Main text |
| `muted` | `#536579` | `#8FA2B8` | Secondary text, labels, captions |

### 3.3 Feedback

| Token | Light | Dark | Use |
|---|---|---|---|
| `success` | `#1E7D45` | `#3FB36E` | Saved, completed, good outcome |
| `warning` | `#E0A100` | `#E8B23A` | Needs a decision soon (with `ink` text) |
| `danger` | `#C62828` | `#EF5350` | Errors, destructive actions, overdue |
| `info` | = `primary` | = `primary` | Neutral information |

### 3.4 Status families

The new model has many statuses (reports, cases, notices, court cases). Each status belongs to one
of seven **families**, so a colour always means the same thing anywhere in the app.

| Family | Fill | Text on fill | Meaning |
|---|---|---|---|
| `new` | `#1D6FA5` | white | Waiting for us to act |
| `progress` | `#6D4AC9` | white | Being worked on |
| `waiting` | `#E0A100` | `ink` | Waiting for a decision or a reply |
| `good` | `#1E7D45` | white | Concluded with action taken |
| `legal` | `#0E7C7B` | white | With the court |
| `closed` | `#64748B` | white | Concluded without action, or superseded |
| `problem` | `#C62828` | white | Rejected, overdue, failed, returned |

Fills are the same in both themes. Tints for row highlights use the fill at 10–15% opacity.

Mapping (to be completed as each piece is agreed):

| Record | `new` | `progress` | `waiting` | `good` | `legal` | `closed` | `problem` |
|---|---|---|---|---|---|---|---|
| Report (triage) | pending | — | needs info | accepted | — | merged | rejected |
| Case | open, dispatched | accepted, investigating | recommended | decided, closed with action | referred to court | closed (warning / NFA) | returned, overdue |
| Penalty notice | issued, served | — | disputed, nominated | paid | court referral | transferred, withdrawn, legacy | overdue, service failed |
| Court case | referred | filed, hearing | — | convicted | — | acquitted, withdrawn | — |
| Dispatch | sent | accepted, in progress | — | resolved | — | — | returned, not accepted 24h, overdue 72h |

### 3.5 Contrast (WCAG 2.1 AA, checked 2026-10-20)

| Pair | Ratio |
|---|---|
| `ink` on `canvas` | 15.6 : 1 |
| `muted` on `surface` | 6.0 : 1 |
| White on `frame` | 15.5 : 1 |
| White on `primary` | 5.4 : 1 |
| `accent-ink` on white | 5.1 : 1 |
| White on `progress` / `good` / `legal` / `closed` / `problem` | 6.1 / 5.2 / 5.0 / 4.8 / 5.6 : 1 |
| `ink` on `warning` | 7.4 : 1 |
| Dark: `ink` / `muted` / `primary` / `accent-ink` on `surface` | 14.5 / 6.5 / 6.2 / 7.9 : 1 |

Every text pairing meets AA (4.5 : 1). `brand-blue` (4.1 : 1) is never used for text.

### 3.6 Charts

Chart colours are defined in [12 — Dashboards and reports](12-dashboards-and-reports.md)
*(planned)*, following data-visualisation guidelines: status charts use the status families;
volume uses `primary`; categorical series use a dedicated, colour-blind-safe palette — never a
rainbow.

## 4. Layout

| Element | Rule |
|---|---|
| Sidebar | `frame` background, white logo area, items in `frame-muted`; the selected item gets `frame-active` background, white text and a 3 px `accent` bar on the left. Collapsible on small screens. |
| Top bar | `surface` background with a bottom `line` border (no solid blue bar); page search, theme toggle, notifications, user menu. |
| Page | `canvas` background; content max width 1280 px; 24 px gutters (16 px on phones). |
| Page header | Title 24 px semibold `ink`; one-line description in `muted`; primary action on the right. |
| Cards | `surface`, 1 px `line` border, radius 12 px, very soft shadow. |
| Tables | Header row `raised`, 12 px uppercase `muted` labels; rows separated by `line`; hover `raised`. |

## 5. Typography

- Font: **Inter** (400, 500, 600, 700). Numbers in tables and tiles use tabular figures.
- Scale: 12 · 14 (body) · 16 · 18 · 20 · 24 (page title) · 30 (dashboard figures).
- Page titles are **semibold**, not extra-bold.
- Sentence case everywhere ("New complaint", not "New Complaint").
- Monospace only for codes: vehicle plates, case and notice numbers, references.

## 6. Shape, spacing and elevation

- Spacing on a 4 px grid (4, 8, 12, 16, 24, 32, 48).
- Radius: 8 px for buttons and inputs, 12 px for cards and dialogs, full for pills and avatars.
- Elevation: borders do most of the work; shadows only for cards (subtle), menus and dialogs.

## 7. Components

| Component | Rules |
|---|---|
| Buttons | **Primary** (filled `primary`), **Secondary** (outlined `line`), **Danger** (filled `danger`, destructive only), **Ghost** (text only). One primary button per area. Height 40 px (32 px compact). |
| Status badge | Pill, filled with the status family colour, label always present (colour is never the only signal). |
| Attention marker | Small `accent` dot or count — e.g. "Not accepted 24h · 4". |
| Inputs | 40 px, `line` border, `primary` focus ring (2 px, 20% opacity). Errors in `danger` under the field. Labels above, never placeholder-only. |
| Tabs | Underline style, `primary` for the selected tab. |
| Dialogs | `surface`, radius 12 px, title + one-line explanation, actions bottom-right; destructive dialogs name what will happen. |
| Toasts | Short, sentence case, no emoji. Success uses `success`, errors `danger`. |
| Empty states | Icon, one-line explanation, and the next action. |
| Loading | Skeleton placeholders (built), never a spinner over the whole page. |

## 8. Content rules

- Dates: `18 Oct 2026, 08:15` (Asia/Colombo); relative ("3 hours ago") only with the full date on hover.
- Money: `Rs 1,500` (no decimals unless needed).
- Plates: canonical form `WP CAB-1234`, monospace.
- No emoji in the interface. No exclamation marks in system messages.
- Status labels use the agreed names from each piece (e.g. "Awaiting decision", not "recommended").

## 9. Accessibility

- WCAG 2.1 AA contrast for all text (§3.5).
- Every interactive element reachable by keyboard with a visible focus ring.
- Colour is never the only signal (badges have labels, charts have legends or direct labels).
- Respect reduced-motion settings (built for skeletons).
- Light and dark themes are both first-class.

## 10. Implementation notes

- Replace the current tokens in `index.css` with §3, keeping the variable names where they already
  exist (`canvas`, `surface`, `raised`, `line`, `ink`, `muted`, `primary`, `attention` →
  renamed `accent`) so pages built recently need only small changes.
- Status classes come from one module (today `utils/violationStatus.js`), extended to all
  record types per §3.4.
- Older pages still on hard-coded `slate-*` classes are migrated page by page as each piece is
  built.

## 11. Decisions

All decisions agreed on 2026-10-20 as recommended.

| # | Decision | Agreed |
|---|---|---|
| D13-1 | Approve the palette in §3 (navy frame, blue actions, orange accent, seven status families). | **Approve.** |
| D13-2 | Navy sidebar and white top bar, replacing the orange-tinted sidebar and solid blue top bar. | **Yes** — the most recognisable "professional system" layout, and the white logo area sits well on navy. |
| D13-3 | Page titles from 36 px extra-bold to 24 px semibold. | **Yes** — less shouting, more room for content. |
| D13-4 | Radius from 16 px to 12 px (cards) and 8 px (controls). | **Yes** — crisper and more formal. |
| D13-5 | Remove emoji from all interface text and toasts. | **Yes.** |
| D13-6 | Keep both light and dark themes. | **Yes**, light as default. |
| D13-7 | A preview page (palette, buttons, badges, a sample table and dashboard in both themes) before applying it to the app. | **Yes** — cheaper to adjust there than across every page. |

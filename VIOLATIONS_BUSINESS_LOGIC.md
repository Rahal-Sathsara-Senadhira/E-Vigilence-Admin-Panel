# Violations — Redesigned Business Logic

## Why this exists

`PROJECT_STORYLINE.md` documents the system as it evolved. This document specifies how the
**Violations** feature *should* work — the gap between "we tracked that something was reported"
and "we're actually enforcing a violation" — and is the reference for the restructuring work
tracked against it.

Confirmed gaps in the current implementation (as of 2026-09-28) that this design closes:

- `vehicleNumber`, `vehicleType`, `callerMobile` are collected on the New Complaint form but never
  persisted as real fields — the backend silently drops them; the frontend defensively stuffs them
  into free-text `description` as a workaround (`NewComplaint.jsx#L235-239`).
- `type` and `violations[]` are free-typed strings with no controlled vocabulary — `"traffic"` and
  `"Traffic"` are different categories to the system. No fine amount, legal code, or severity is
  attached to any violation type.
- Status is a free-for-all label — any authorized user can move any violation to any of the six
  statuses in any order, with no required fields on a given transition (e.g., rejecting needs no
  reason).
- There's no enforcement consequence — no fine, no citation, no due date, nothing that happens
  *because* a violation was verified.
- Duplicate-detection (`possibleDuplicateOf`/`duplicateWarning`) is computed and stored by the
  backend but never displayed anywhere in the frontend.

## Scope of this document

Violations-specific business logic only. The broader role/nav restructuring discussed alongside
this (a Regional Supervisor tier, per-role sidebar reorganization) is a system-wide change and is
intentionally **out of scope here** — noted at the end as a future phase, not built now.

---

## 1. Violation Catalog (new)

A controlled, admin-managed list of violation types, replacing free-typed `type`/`violations[]`
strings.

**New model — `ViolationCatalogEntry`** (`Backend/src/db/providers/mongo/models/ViolationCatalogEntry.js`):

| Field | Type | Notes |
|---|---|---|
| `name` | String, required, unique | e.g. "No helmet" — what officers pick from |
| `legalCode` | String, optional | e.g. "Section 140(1)(b)" — for citation generation |
| `fineAmount` | Number, required | in the local currency's smallest unit or a plain number, TBD with the user |
| `severity` | enum: `minor \| moderate \| severe` | drives sort order / visual weight, not a hard rule |
| `isActive` | Boolean, default true | retiring an entry doesn't delete historical violations that used it |

**Impact on `Violation`:** `violations[]` (the array of selected violation types on a report)
becomes an array of `ObjectId` refs to `ViolationCatalogEntry` instead of free strings. `type`
(the single "category") is derived from the first/primary catalog entry rather than being its own
free-typed field — removing the `type`/`category` duality that already causes bugs (`Reports.jsx`'s
own comment about `"traffic"` vs `"Traffic"` fragmenting is a direct symptom of this).

**HQ-only CRUD** at `/api/violation-catalog`, mirroring the existing `stations.routes.js` pattern
(`requireAuth` + `requireRole("hq")`).

**Frontend:** `SearchMultiSelect` in `NewComplaint.jsx` and `ViolationDetails.jsx`'s edit mode
already fetch from a list via `asyncFilter` — swap `VIOLATIONS` (a hardcoded array in
`utils/violationOptions.js`) for a live fetch against `/api/violation-catalog`. New HQ-only page,
**Violation Catalog**, for managing entries (same `Card`/`Modal`/`Field` pattern as `Users.jsx`).

## 2. Structured vehicle fields

Add to the `Violation` schema, matching what `NewComplaint.jsx` already collects:

```js
vehicleNumber: { type: String, default: null, uppercase: true, trim: true, index: true },
vehicleType:   { type: String, default: null },
callerMobile:  { type: String, default: null },
```

`violations.controller.js#create`/`#update` read these off `req.body` and pass them through
(currently silently dropped). `Violations.jsx`'s table gets a **Vehicle** column. The search box
(`title, description, or violation…`) extends to match `vehicleNumber` too — searching a plate
number should find every violation tied to it, not just the ones where it happened to land in the
auto-generated title.

The description-stuffing workaround in `NewComplaint.jsx` (`"Vehicle: X • Caller: Y • Type: Z"`
appended to `description`) is removed once the real fields exist — that was only ever there to stop
manually-typed data from being lost, and led to double-showing the same information (in the
description text *and*, in the case of the title, the vehicle number *and* in a dedicated column
once this ships).

## 3. Status workflow — real transitions, not a free-for-all label

Keep the existing six statuses (`open, pending, in_review, resolved, verified, rejected`) — the
vocabulary itself is fine, it's the lack of *rules* that's the problem.

**New shared module** `Backend/src/utils/violationWorkflow.js`:

```js
// Which roles may move a violation FROM a given status TO a given status.
const TRANSITIONS = {
  open:      { in_review: ["station_admin", "station_officer", "hq"], rejected: ["hq"] },
  pending:   { in_review: ["station_admin", "station_officer", "hq"], rejected: ["hq"] },
  in_review: { verified: ["station_admin", "hq"], rejected: ["station_admin", "hq"], resolved: ["hq"] },
  verified:  { resolved: ["hq"], rejected: ["hq"] }, // HQ can still overturn
  rejected:  { in_review: ["hq"] },                  // HQ can reopen
  resolved:  {},                                     // terminal — no further transitions
};
```

`violations.controller.js#update` and `dispatch.service.js#stationUpdateViolationForStation` both
call a shared `assertValidTransition(fromStatus, toStatus, callerRole)` before applying a status
change, throwing `403` if the caller's role can't make that specific move. This is additive to the
existing `statusHistory` audit trail (already built) — the trail already records *who* changed
*what*; this adds *whether they were allowed to*.

**Required fields per transition:**
- `→ rejected` requires a non-empty `rejectionReason` (new `Violation` field, string).
- `→ verified` requires at least one item in `images`/`videos`/`audios` — can't verify a violation
  with zero evidence attached.

Both checks live in the same `violationWorkflow.js` module so the rule and the transition-map live
together.

## 4. Citation record — the actual enforcement consequence

**New model `Citation`** (`Backend/src/db/providers/mongo/models/Citation.js`), created
automatically the moment a violation transitions to `verified`:

| Field | Type |
|---|---|
| `violation` | ObjectId ref Violation |
| `citationNumber` | String, auto-generated, unique (e.g. `CIT-2026-000123`) |
| `fineAmount` | Number — copied from the catalog entry at time of verification (so later catalog price changes don't retroactively change already-issued citations) |
| `dueDate` | Date — `verifiedAt + 30 days`, configurable via system settings |
| `paymentStatus` | enum: `unpaid \| paid \| appealed \| waived`, default `unpaid` |
| `issuedBy` | String — the verifying user's id |

This is the piece that makes "verified" mean something: a citation with a real dollar amount and a
due date exists afterward, not just a status label. Payment processing itself is out of scope —
`paymentStatus` is a field a future integration (or manual HQ update) can move, same pattern as
everything else in this app right now (no payment gateway exists anywhere in this codebase).

**New page:** `Citations` (HQ + station, scoped like Violations already are), listing issued
citations with their payment status. Read-heavy, minimal write surface for v1 (HQ can mark
paid/waived manually).

## 5. Surface duplicate-detection in the UI

No backend change needed — `possibleDuplicateOf`/`duplicateWarning` already exist and work
(verified working this session). Frontend-only:

- `NewComplaint.jsx`: after a successful submit, if the response has `duplicateWarning: true`, show
  a toast/banner: *"This may be a duplicate of N nearby report(s) — check before dispatching."*
- `Violations.jsx` table: a small warning icon/badge on any row where `possibleDuplicateOf.length > 0`.
- `ViolationDetails.jsx`: a card listing the linked possible-duplicate violations (title + link),
  so HQ can actually compare and merge/dismiss the concern — currently there's no way to even see
  *which* violations were flagged as related.

## Explicitly deferred (not part of this restructuring pass)

- Regional Supervisor role and the full per-role nav sidebar reorganization discussed earlier —
  system-wide change, separate effort.
- SLA/escalation on stale `open` violations.
- Any real payment gateway integration for citations.

## Migration note

Existing `Violation` documents have `violations[]` as plain strings, not catalog refs. Switching
that field's meaning requires either a one-time migration script (match existing strings to new
catalog entries by name, creating new catalog entries for any that don't match) or keeping both
`violations[]` (legacy strings, frozen) and a new `violationEntries[]` (catalog refs, used going
forward) side by side. Decide which before implementing part 1 — recommend the migration script,
since carrying two parallel fields forever is exactly the kind of duplication this redesign is
trying to remove.

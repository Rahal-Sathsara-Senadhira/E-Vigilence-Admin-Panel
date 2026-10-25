# 11 — Mobile app integration

**Status:** Agreed (2026-10-20) · **Depends on:** [02](02-reports-and-triage.md), [09](09-time-limits-and-notifications.md), [16](16-citizen-rewards.md) · **Last updated:** 2026-10-20

## 1. Purpose

The **E-Vigilance mobile app** is how the public reports offences they see on Sri Lankan roads,
follows what happens, and receives rewards. It is a separate project with its own backend. This
piece defines the **contract** between the app and this system: what each side writes, what each
side reads, and the rules both must follow.

## 2. Current state (as of 2026-10-20)

- Both systems share **one MongoDB database**. The app writes reports to the `reports`
  collection; this system copies new ones into its own records every minute
  (`citizenReportSync.js`).
- Report fields today: user, evidence (photos/videos/voice note), vehicle type/number/model,
  date-time, `issueType` (**free text**), location text + GPS, details, status.
- Status written back to the app is a three-value label (`In Progress`, `Completed`, `Rejected`)
  plus a rejection reason.
- Citizen accounts live in the same `users` collection as staff, told apart by role.
- Reports deleted by HQ are remembered so the sync doesn't re-import them.

Problems: free-text offences; a status label that can't express "needs information", merges or
rewards; no way to ask the reporter anything; no idempotency (a re-sent report becomes two);
the app can delete evidence the police still need.

## 3. The contract

Keep the **shared database** for now (both sides already use it), but with explicit ownership:
each collection has **one writer**. A later phase can replace it with an API between the two
backends without changing the rules (D11-1).

| Collection | Written by | Read by | Contents |
|---|---|---|---|
| `reports` | App | E-Vigilance | The citizen's report (§4) |
| `report_updates` | E-Vigilance | App | Milestones, questions, reward lines for each report (§5) |
| `report_replies` | App | E-Vigilance | The citizen's answers to "needs information" |
| `reward_accounts` | E-Vigilance | App | Balance, ledger, eligibility, suspension (§6) |
| `payout_requests` | App | E-Vigilance | Requests to pay out confirmed points |
| `account_deletions` | App | E-Vigilance | Citizens who deleted their account (§6) |
| `offence_schedule_public` | E-Vigilance | App | The offences citizens can pick from (name, description, icon — no fines) |

**Database permissions:** the app's database user can write only its own collections; this
system's user writes only its own (D11-2).

## 4. What the app sends (`reports`)

| Field | Rule |
|---|---|
| `clientReportId` | **Required**, unique per device — a re-sent report is recognised and ignored (idempotency) |
| `userId` | The citizen's account (anonymous reports carry no account and earn no rewards) |
| `offenceIds` | **From `offence_schedule_public`** — no free text (replaces `issueType`) |
| `occurredAt` | Required; not in the future; within 30 days ([02](02-reports-and-triage.md)) |
| `latitude`, `longitude`, `address` | GPS required unless the citizen sets the place on a map; inside Sri Lanka |
| `vehicleNumber`, `vehicleType`, `vehicleModel` | Plate in any spelling — normalised on import |
| `evidence[]` | Each with `capturedInApp` (true when recorded with the app's camera) and capture time/place when available |
| `description` | 10–2000 characters |

**Evidence rules for the app:**
- Prefer **capture in the app** (camera/recorder), which records time and GPS at capture. Files
  chosen from the gallery are allowed but marked `capturedInApp: false`, and triage sees the
  difference (D11-4).
- Once a report is sent, the app **must not delete its evidence files**. "Deleting" a report in
  the app hides it from the citizen only; the police copy stays ([10](10-evidence-audit-and-privacy.md)).
- Limits match this system's: photos 25 MB, videos 500 MB, audio 100 MB.

**Before sending,** the app shows: *"If someone is in danger right now, call 119."* and a short
honesty notice: false or edited reports are rejected and can lead to suspension.

## 5. What the app receives (`report_updates`)

For each report, an ordered list of updates:

| Update | Shown to the citizen |
|---|---|
| `received` | Received |
| `needs_info` (with the question) | We need more information — with a reply box |
| `under_review` | Under review (after accept or merge) |
| `action_taken` | Action taken |
| `closed_no_action` | Closed — no action possible |
| `rejected` (reason code) | Closed — with the plain-language message ([02](02-reports-and-triage.md) §6.4) |
| `reward` (pending / confirmed / reversed / not eligible) | Reward line ([16](16-citizen-rewards.md) §8) |

The app's backend sends a **push notification** for each new update ([09](09-time-limits-and-notifications.md) §5.3).
No update ever contains the offender's details, the station, or a fine amount.

### 5.1 Document shapes (as built, 2026-10-21)

`report_updates` — one document per milestone, newest last:

| Field | Content |
|---|---|
| `reportId` | The app's `reports` document `_id` |
| `userId` | The citizen's account id |
| `reportNumber` | Our number, e.g. `RP-2026-000123` (empty if the report was refused on import) |
| `type` | `received` · `needs_info` · `under_review` · `rejected` · later `action_taken` · `closed_no_action` · `reward` |
| `title`, `message` | Plain-language text to show as is |
| `question` | For `needs_info` only |
| `at` | When |

`report_replies` — written by the app: `reportId` (the app's `reports` `_id`), `userId`, `answer`
(max 1000 characters), `createdAt`. Replies to a report that isn't waiting for an answer are ignored.

Evidence in `reports.evidence[]`: `url` (absolute HTTPS, or a path under `APP_MEDIA_BASE_URL`),
`kind`, `capturedInApp`, `capturedAt`. Files are downloaded once on import; the host must be on
`APP_MEDIA_ALLOWED_HOSTS`.

- **Redirects.** When the app stores media in R2, its link answers with a redirect to a signed R2
  address valid for an hour. The import follows up to three redirects, and every address on the
  way must pass the same checks, so the R2 host must be on the list too
  (e.g. `.r2.cloudflarestorage.com`).
- **Media key.** With `MEDIA_ACCESS=signed` the app serves a file only to its owner's signed link
  or to a request carrying `X-Media-Key`. This system sends `APP_MEDIA_KEY` (the app's
  `MEDIA_SERVICE_KEY`) on the first request only, never on to the storage host.

`payout_requests` — written by the app: `userId` (string), `method` (`bank` or `wallet`),
`accountNumber` and `bankName` for a bank, `walletNumber` for a wallet (digits only), `accountName`,
`createdAt`. The app allows one open request at a time: one this system hasn't answered yet, or
whose answer in `reward_accounts.payouts[]` (matched by `requestId`) is still `requested`,
`batched` or `failed`.

### 5.2 The app's side (as built, 2026-10-24)

The app now sends the §4 contract: `clientReportId` (a retry returns the stored report),
`offenceIds` chosen from `offence_schedule_public` (1–5; it falls back to `issueType` text only
while nothing is published), `occurredAt` within 30 days, `injuries`, `description` (10–2000),
GPS inside Sri Lanka, and `capturedInApp`/`capturedAt` on every file. It still fills `dateTime`,
`issueType`, `additionalDetails`, `evidencePath` and `status` for the previous admin panel.

Citizens see each report's `report_updates` as a timeline with our reference number, answer
`needs_info` questions once each, see their `reward_accounts` balance, lines and payouts, and
ask for payouts. The app refuses reports from a `suspended` account and enforces the daily limit
(20, counted from midnight Colombo time). Push notifications for new updates are not built yet;
citizens see updates when they open the app.

## 6. Identity, rewards and suspension (`reward_accounts`)

- **Verification is done in the app**: phone by one-time code, NIC by the app's own check. The
  app records `phoneVerified`, `nicVerified`, `dateOfBirth`; this system trusts these flags for
  reward eligibility ([16](16-citizen-rewards.md) §3) (D11-3). As built: the code is six digits,
  valid 10 minutes, five tries; `nicVerified` is true when the birth date encoded in the NIC
  matches the date of birth given at sign-up. A new phone number must be verified again.
- `reward_accounts` holds the balance (pending, confirmed, paid out, expiring), the ledger lines,
  and **status**: `active`, `flagged`, `suspended` (with the reason code and date).
- A `suspended` citizen can't send reports from the app; the app enforces it, and this system
  rejects any report from a suspended account on import ([02](02-reports-and-triage.md) §10).
- Payout requests (`payout_requests`): amount, method (bank / wallet), account details; this
  system answers through `reward_accounts` (status per request).
- Account deletion (`account_deletions`, written by the app: `userId`, `deletedAt`): this system
  keeps the citizen's reports as police records under an anonymous token, removes their name
  and phone from them, lets unpaid points lapse, keeps paid-out history for audit, and removes
  their `reward_accounts` document ([10](10-evidence-audit-and-privacy.md) §5.5).

## 7. Limits on the app side

| Limit | Default |
|---|---|
| Reports per account per day | 20 (of which 10 can earn rewards — [16](16-citizen-rewards.md)) |
| Evidence files per report | 10 |
| Reply length (needs information) | 1000 characters |

## 8. Import rules (this system)

- New `reports` are imported continuously (built: every minute), each **once** by
  `clientReportId`.
- Plates are normalised, the location is checked, the evidence fingerprint is computed on import,
  and the report enters triage as `pending` ([02](02-reports-and-triage.md)).
- Invalid reports (no offences from the schedule, outside Sri Lanka, too old) are imported and
  rejected immediately with the matching reason, so the citizen is told why.

## 9. Migration from today

- Existing app reports keep their link; their three-value status is mapped once to the new
  updates (`In Progress` → `under_review`, `Completed` → `action_taken`, `Rejected` → `rejected`).
- The app is updated to send `clientReportId` and `offenceIds`; until then, `issueType` text is
  matched to the schedule as today and unmatched reports go to triage flagged "offence not
  recognised".

## 10. Loopholes this closes

| Loophole | Closed by |
|---|---|
| Free-text offences that don't match the schedule | `offenceIds` from the published schedule (§4) |
| Re-sent reports becoming duplicates | `clientReportId` (§4) |
| Citizens deleting evidence the police rely on | App must not delete; deletion hides only (§4) |
| Old photos passed off as new | `capturedInApp` with capture time/place (§4) |
| Either system overwriting the other's data | One writer per collection, database permissions (§3) |
| Suspended reporters continuing through the app | App enforces; import rejects (§6) |

## 11. Decisions

All decisions agreed on 2026-10-20 as recommended.

| # | Decision | Agreed |
|---|---|---|
| D11-1 | Integration style | **Shared database with one writer per collection now; an API between the backends later.** |
| D11-2 | Database permissions per system | **Yes — each system's database user writes only its own collections.** |
| D11-3 | Identity verification | **Done by the app (phone code, NIC check); this system trusts the flags.** |
| D11-4 | Gallery uploads | **Allowed, marked as not captured in the app, visible in triage.** |
| D11-5 | App-side limits | **20 reports per day, 10 files per report.** |
| D11-6 | Offences in the app | **Chosen from the published schedule only.** |
| D11-7 | Evidence deletion in the app | **Not allowed after sending; hide only.** |
| D11-8 | Coordination | **This contract is shared with the mobile app team, and changes to it need both teams' agreement.** |

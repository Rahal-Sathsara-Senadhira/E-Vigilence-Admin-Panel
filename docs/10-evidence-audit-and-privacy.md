# 10 — Evidence, audit and privacy

**Status:** Agreed (2026-10-20) · **Depends on:** [02](02-reports-and-triage.md)–[06](06-court-cases.md) · **Last updated:** 2026-10-20

## 1. Purpose

E-Vigilance holds evidence that may be used in court and personal data about citizens, owners and
drivers. This piece defines how evidence is kept trustworthy, how every action is recorded, who
may see personal data, and how long anything is kept.

## 2. Current state (as of 2026-10-20)

Built and kept:
- Evidence uploads are staged and claimed; the file type is checked from its content; size limits
  per kind; unclaimed uploads deleted after 24 h.
- The **SHA-256 fingerprint of the original** is recorded before compression; videos and long
  audio are compressed for viewing.
- History exists in several places: case status history, payment history, station audit log,
  dispatch history.

Gaps: the **original file is not kept** (only its fingerprint); there is no single audit log, no
record of who viewed personal data, no retention rules, and no masking rules.

## 3. Evidence

### 3.1 What is stored for each item
| Copy | Purpose | Who can open it |
|---|---|---|
| **Original file** (as received) | Proof; court | HQ, and the prosecuting officer when preparing a court bundle |
| **Viewing copy** (compressed, or the original for photos and short audio) | Everyday review | Anyone who can see the case |
| **Fingerprint** (SHA-256 of the original) | Integrity check | Shown with every item |

This implements [06](06-court-cases.md) D06-4: originals are kept from now on. Items uploaded
before the change keep only their fingerprint and viewing copy, and are marked "original not
retained".

### 3.2 Chain of custody
Every evidence item has a custody log, appended automatically:

| Event | Recorded |
|---|---|
| Received | Channel, report, who/what submitted it, time, fingerprint |
| Processed | Compression result, viewing-copy fingerprint |
| Original opened or downloaded | Who, role, why (reason required), time |
| Added to a court bundle | Court case, who, time |
| Integrity check | Result (§3.3) |
| Deleted at end of retention | Rule applied, time |

### 3.3 Integrity checks
A weekly job re-computes the fingerprint of a sample of stored originals (and of every original
in an open court case) and compares it with the recorded one. A mismatch raises an **HQ alert**
and marks the item "integrity check failed" on every screen that shows it.

### 3.4 Rules
- E1. Evidence is never edited or replaced. A better copy is added as a **new** item.
- E2. Evidence is never shown to the public. The reporter sees their own uploads only.
- E3. Evidence images on a penalty notice are stills chosen by the officer, showing the vehicle
  and plate; bystanders' faces are not used.

## 4. The audit log

### 4.1 One log for everything
All significant actions are written to a single **append-only audit log** (record timelines on
screens are views of it):

| Field | Content |
|---|---|
| `at` | Time |
| `actor` | User id, role, station — or `system` + job name, or `citizen` / `addressee` |
| `action` | e.g. `report.triaged`, `case.decided`, `notice.withdrawn`, `payment.recorded`, `person.viewed` |
| `target` | The record affected |
| `summary` | What changed (before → after for key fields) |
| `reason` | Required for overrides, withdrawals, reopenings, corrections, original-file access |
| `source` | IP address and app (admin panel, mobile app, payment page) |
| `hash` | Fingerprint of this entry plus the previous entry's hash (§4.2) |

### 4.2 Tamper evidence
Each entry includes the previous entry's hash, forming a chain; a daily job verifies the chain.
Removing or altering an entry breaks it and alerts HQ and the developers (D10-3).

### 4.3 What is logged
- Every state change in reports, cases, notices, court cases, payments, payouts and rewards.
- Every override, withdrawal, reopening, merge, correction and refund.
- Every **view** of a person record, every opening of an original evidence file, every export.
- Account and role changes, settings changes, time-limit changes.
- Sign-ins and failed sign-ins.

### 4.4 Who can read it
| Role | Sees |
|---|---|
| HQ | Everything |
| OIC | Their station's records |
| Dev | Technical events (sign-ins, settings, jobs) — **not** personal data views |
| Officer | The timeline of cases they can see |

## 5. Privacy

Sri Lanka's **Personal Data Protection Act, No. 9 of 2022** applies to personal data processing.
Before go-live the design must be reviewed against it by the police's legal advisers (D10-8);
the rules below are written to make that review straightforward.

### 5.1 Principles
- **Collect only what the step needs.** E.g. a reporter's NIC only when they want rewards.
- **Use it only for enforcement** (and rewards, for reporters).
- **Show it only to roles that need it** ([01](01-roles-and-permissions.md)).
- **Keep it only as long as the retention schedule allows** (§6).

### 5.2 Reporter confidentiality
- The reporter's identity is **never** shown to the addressee, on a notice, on the payment page,
  or in a court bundle — unless a court orders it (D10-5).
- Inside the police, the reporter's contact details are visible to HQ and the handling station
  only, for follow-up.

### 5.3 Masking
| Data | Lists and search results | Detail pages (authorised roles) |
|---|---|---|
| NIC / licence number | Last 4 characters (`*******5678V`) | Full |
| Phone | Last 3 digits | Full |
| Address | Town only | Full |
| Reporter name | Hidden | Visible to HQ and the handling station |
| Bank / wallet account | Last 4 digits | Last 4 digits (never shown in full after saving) |

### 5.4 Exports
- CSV exports exclude personal data by default; including it requires HQ, a reason, and is logged.

### 5.5 People's requests
- **Citizens** see their own reports, rewards and payouts in the mobile app, and can delete their
  account; reports they sent stay as police records (anonymised link to the deleted account).
- **Addressees** see their own notice through the payment page; other requests go through the
  station.

## 6. Retention (to be confirmed by legal review)

| Record | Kept for | Then |
|---|---|---|
| Rejected report — evidence | 1 year | Evidence deleted; report kept anonymised for statistics |
| Closed case, no enforcement (NFA) | 2 years after closing | Evidence deleted; personal data anonymised |
| Case with a paid notice or warning | 7 years after closing | Evidence and personal data deleted |
| Court case | 10 years after the final verdict | Evidence and personal data deleted |
| Audit log | 10 years | Deleted |
| Notifications | 90 days ([09](09-time-limits-and-notifications.md)) | Deleted |
| Unclaimed uploads | 24 hours (built) | Deleted |

- **Legal hold:** nothing linked to an open dispute, court case or appeal is deleted, whatever
  its age.
- Deletions run monthly, are listed in the audit log, and can be previewed by HQ beforehand.

## 7. Security baseline

- All traffic over HTTPS; evidence storage private (R2 / GridFS proxied through the backend —
  built).
- Secrets only in environment settings, never in code.
- Daily backups of the database and evidence storage, restore tested quarterly.
- Accounts re-checked on every request (built); sign-in rate limits (built).

## 8. Loopholes this closes

| Loophole | Closed by |
|---|---|
| A court asks for the original video and we don't have it | Originals kept (§3.1) |
| Evidence swapped or altered after the fact | Fingerprints, custody log, integrity checks (§3) |
| History edited to hide a decision | Append-only, hash-chained audit log (§4) |
| Staff browsing people's personal data | View logging and role limits (§4.3, §5) |
| The offender finds out who reported them | Reporter confidentiality (§5.2) |
| Personal data kept forever | Retention schedule (§6) |
| Bulk export of personal data | Exports exclude it by default; logged (§5.4) |

## 9. Decisions

All decisions agreed on 2026-10-20 as recommended.

| # | Decision | Agreed |
|---|---|---|
| D10-1 | Originals: who can open them | **HQ, and the prosecuting officer for a court bundle — reason required, logged.** |
| D10-2 | Retention schedule | **As §6**, confirmed by legal review. |
| D10-3 | Single append-only audit log with a hash chain | **Yes.** |
| D10-4 | Masking rules | **As §5.3.** |
| D10-5 | Reporter identity | **Never disclosed to the addressee or in court bundles unless a court orders it.** |
| D10-6 | Integrity checks | **Weekly sample, plus every original in an open court case.** |
| D10-7 | Exports | **No personal data by default; HQ with a reason to include it.** |
| D10-8 | Legal review | **Review against the Personal Data Protection Act No. 9 of 2022 before go-live.** |

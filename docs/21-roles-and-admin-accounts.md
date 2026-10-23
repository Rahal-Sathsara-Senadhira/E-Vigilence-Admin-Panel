# 21 — Roles and the main administrator account

**Status:** Draft — names to be filled in (2026-10-23) · **Depends on:** [20](20-roles-v2.md) ·
**Last updated:** 2026-10-23

## 1. Purpose

A plain-language guide to who uses E-Vigilance and what each person can do, and the rules for the
**main administrator account** — the first account in the system, from which every other account
is created.

The detailed permission table is in [20](20-roles-v2.md). This document is for managers deciding
who gets which role, and for the person who will hold the main administrator account.

## 2. The roles

Everyone signs in with their **email or police service number** and their own password. Nobody
shares an account. Roles marked "two-step" also need a code from an authenticator app on their
phone at every sign-in.

### 2.1 National (Traffic Headquarters and supporting units)

| Role | Usually held by | Does | Can't | Two-step |
|---|---|---|---|---|
| **System administrator** | IT unit | Keeps the system running; creates HQ administrator accounts | See any report, case, person, evidence or payment | Yes |
| **HQ administrator** | Traffic HQ admin officer | Creates and manages staff accounts; sets up divisions, stations, the offence schedule, time limits and reward rules | Decide cases; create system administrators | Yes |
| **HQ operator** | Traffic HQ desk officers | Checks every incoming report (triage) and sends cases to the right station | Decide outcomes | Yes |
| **HQ supervisor** | Senior officer at Traffic HQ | Decides cases sent up from stations; overrides decisions; withdraws notices; settles jurisdiction disputes | Manage accounts or money | Yes |
| **Finance officer** | Accounts branch | Reviews payments taken at counters, approves refunds and reward payouts, reconciles | Approve something they recorded themselves | Yes |
| **Auditor** | Internal audit, oversight | Reads everything, including the full audit log | Change anything | Yes |
| **Executive viewer** | IGP, DIG Traffic | Sees dashboards and monthly reports | See names, ID numbers or addresses; change anything | Yes |

### 2.2 Division

| Role | Usually held by | Does | Can't | Two-step |
|---|---|---|---|---|
| **Division supervisor** | SSP/SP office | Oversees the division's stations; moves cases between them; decides cases the OIC investigated; reviews disputes | Act outside their division | Yes |

### 2.3 Station

| Role | Usually held by | Does | Can't | Two-step |
|---|---|---|---|---|
| **Station OIC** | Officer in charge | Accepts cases sent to the station, assigns officers, decides outcomes, manages the station's officers and clerks | Act for other stations; decide a case they recommended | Optional |
| **Traffic officer** | Investigating officers | Investigates the cases assigned to them, recommends outcomes, serves notices | Decide outcomes | Optional |
| **Station clerk** | Desk / reserve staff | Records walk-in and phone reports, posts notices, takes counter payments | Investigate or decide cases | Optional |

### 2.4 Safeguards built in

- **Nobody approves their own work.** The officer who recommends an outcome can't decide it;
  whoever records a payment can't approve it; whoever prepares a refund can't approve it.
- **Read-only roles stay read-only.** Auditor and executive viewer accounts can never change
  anything.
- **Nobody manages their own account** — role, station and active status are changed by someone
  else.
- **Every sign-in and every change is recorded** in a tamper-evident audit log.

## 3. Who creates whose account

```
System administrator (main administrator account)
 ├─ other system administrators
 └─ HQ administrators
     └─ HQ operators, HQ supervisors, finance officers, auditors, executive viewers,
        division supervisors, station OICs, traffic officers, station clerks
          Station OIC
           └─ traffic officers and station clerks at their own station
```

Forgotten passwords are reset by the same person who manages the account: the OIC for their
officers and clerks, the HQ administrator for everyone else, a system administrator for
administrators. There is no "reset by email".

## 4. The main administrator account

### 4.1 What it is

The **first system administrator account**. It exists before anyone else can sign in, and it is
the top of the chain in §3: it creates the other system administrators and the HQ administrators,
who create everyone else.

It does **not** give access to reports, cases, people, evidence or payments. If it is misused, the
damage is limited to accounts and settings — and every action is in the audit log.

### 4.2 Who holds it

| | Post | Name |
|---|---|---|
| **Custodian** (holds the main administrator account) | Head of the Sri Lanka Police IT unit, or the officer they appoint | ______________________ |
| **Backup** (a second system administrator account of their own) | A second officer of the IT unit | ______________________ |
| **Approves both appointments** | DIG Traffic, or the officer responsible for E-Vigilance | ______________________ |

One named person per account. The backup has **their own** system administrator account — never
the custodian's password.

### 4.3 Rules

1. **Never shared.** The username and password belong to the custodian alone. They are never
   written in documents, emails, chat messages, tickets or code — including this document.
2. **Two-step sign-in is required.** The authenticator app is on the custodian's own phone.
3. **Recovery codes in a sealed envelope.** The 10 recovery codes shown at set-up are printed,
   sealed, signed across the seal, and kept in a safe at the IT unit. Opening the envelope is
   recorded in a register.
4. **Not for daily work.** The custodian signs in only to manage administrator accounts. Day-to-day
   staff administration is done by HQ administrators with their own accounts.
5. **Always two system administrators.** If one is unavailable, the other can act. Neither can
   remove their own access.
6. **When the custodian changes post or leaves:** the backup deactivates the old account the same
   day and creates one for the new custodian, who sets their own password and two-step sign-in.
   Recorded in the audit log.
7. **Lost phone or forgotten password:** the other system administrator resets it; the custodian
   sets a new password and two-step sign-in at the next sign-in.

### 4.4 Creating it at go-live

1. On the production server, the IT unit runs a one-time set-up command, with two officers
   present, that creates the main administrator account with a **temporary password**. The
   command refuses to run if any administrator already exists.
2. The custodian signs in, chooses their own password and sets up two-step sign-in. The temporary
   password stops working.
3. The custodian creates the backup system administrator and the first HQ administrator.
4. The custodian seals the recovery codes (rule 3).

### 4.5 If both system administrators lose access

A last-resort procedure on the database itself, done by the IT unit with **two officers present**
and the approving officer (§4.2) informed in writing. It creates a new main administrator account
with a temporary password, as in §4.4, and is recorded in the audit log and the IT unit's register.

## 5. Development and test accounts

The development system has **one demo account for each role** (listed in
[`New Backend/README.md`](../New%20Backend/README.md)), for example `sysadmin@evigilance.local`
for the system administrator.

- Their password is the `SEED_PASSWORD` in `New Backend/.env`. That file is never committed to
  git; the password is not written anywhere else.
- Demo accounts exist only in development. They are never created on the production system, and
  the demo seed refuses to run there.

## 6. To decide

| # | Decision | Recommended |
|---|---|---|
| D21-1 | Custodian of the main administrator account | Head of the Police IT unit, or their appointee — **name to be filled in §4.2** |
| D21-2 | Backup system administrator | A second IT unit officer — **name to be filled in §4.2** |
| D21-3 | Who approves both appointments | DIG Traffic |
| D21-4 | Recovery codes kept sealed in the IT unit's safe, with an opening register | **Yes** |

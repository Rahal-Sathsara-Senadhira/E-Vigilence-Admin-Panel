# 04 — Investigation: vehicles and people

**Status:** Agreed (2026-10-20) · **Depends on:** [03](03-cases-and-dispatch.md) · **Last updated:** 2026-10-20

## 1. Purpose

A penalty must be addressed to an identified person ([00](00-overview-and-glossary.md) principle 2).
Investigation is how a station gets from "a vehicle with this plate did this" to "this person is
responsible": tracing the vehicle's registered owner, identifying the driver where possible,
checking the evidence, and recording statements. This piece also defines the **vehicle** and
**person** records the rest of the system relies on.

## 2. Current state (as of 2026-10-20)

- A violation stores the plate as text (normalised to the Sri Lankan format), vehicle type, make
  and colour. There is **no owner, no driver, no person record**.
- Citations are issued with no addressee.
- There is no way to see a vehicle's or person's history across cases.

## 3. The vehicle register

We cannot query the Department of Motor Traffic (DMT). Officers look a vehicle up through the
existing police channels and **record what they find**. Over time this builds our own register.

| Field | Rules |
|---|---|
| `plate` | Canonical Sri Lankan form (`WP CAB-1234`), unique (built normaliser) |
| `plateCategory` | `standard` (default), or `special` — e.g. diplomatic, military — entered only with HQ approval because the format check doesn't apply (D04-5) |
| `type`, `make`, `model`, `colour` | As recorded from the registry |
| `registeredOwner` | Person (§4) |
| `ownership[]` | History: owner, from date, to date, source |
| `source` | `dmt_lookup` + DMT reference/date + officer + recorded at |
| `flags` | `suspected_false_plate`, `reported_stolen` (§8) |

Rules:
- V1. A vehicle record is created the first time an officer traces it.
- V2. An existing record can be reused for a new case **only if the owner was recorded within the
  last 6 months**; otherwise the officer re-checks and confirms or updates it (D04-2).
- V3. Ownership changes are **added**, never overwritten; the old owner stays in the history.
- V4. The owner who counts for a case is the owner **on the date of the offence** (§8, vehicle
  sold).
- V5. Corrections to a traced owner need a reason and are audited; once a penalty notice has been
  issued on that basis, the correction goes through the notice process ([05](05-outcomes-and-penalty-notices.md)).

## 4. The person register

A person is an owner, a driver, or a company that owns vehicles.

| Field | Rules |
|---|---|
| `type` | `individual` or `organisation` |
| `name` | Required |
| `nic` | Individuals: required when known; validated (old: 9 digits + V/X; new: 12 digits); unique |
| `businessRegNo` | Organisations: business registration number; unique |
| `licenceNumber` | Driving licence number when known; unique |
| `address` | **Required to serve a penalty notice** |
| `phone` | `+94…` form (built normaliser) |
| `points` | Demerit points ledger ([08](08-demerit-points.md)) |
| `history` | Derived: cases, outcomes, points, notices |

Rules:
- P1. Before creating a person, the system searches by NIC, licence number and business
  registration number and offers the match, so the same person isn't entered twice.
- P2. Two records found to be the same person can be **merged by HQ**, with a reason; history is
  combined.
- P3. A citizen reporter and an owner/driver are separate records even if they are the same human
  (the reporter lives in the citizen app); the rewards fraud check compares NIC and phone
  ([16](16-citizen-rewards.md) §7).

## 5. Who is responsible

| Situation | Addressee for a penalty notice |
|---|---|
| Remote report (app, WhatsApp, camera) | The **registered owner**, who can name the driver ([05](05-outcomes-and-penalty-notices.md)) |
| Officer stopped the vehicle / identified the driver | The **driver** |
| Vehicle owned by an **organisation** | The organisation, which **must** name the driver within the notice period |
| Driver identified in the evidence (e.g. clearly shown, admitted in a statement) | The **driver**, with the evidence or statement attached |

## 6. Investigation work

The investigating officer ([03](03-cases-and-dispatch.md) §6) records:

| Item | Content |
|---|---|
| **Vehicle trace** | Plate → vehicle record → owner (§3), with the DMT reference |
| **Evidence review** | Checklist: plate readable; vehicle type/colour matches the registry; time and place consistent with the report; no sign of editing or AI generation; offence visible |
| **Statements** | From the owner, driver or witnesses: who, when, summary, optional attachment (scan/photo/audio) |
| **Additional evidence** | Same upload rules as reports (built: real-type check, original hash, compression) |
| **Notes** | Free text, timestamped, visible to the station and HQ |

### Ready to recommend
An officer can only recommend an outcome ([05](05-outcomes-and-penalty-notices.md)) when:
- the evidence review checklist is complete;
- the offences are confirmed (or corrected, with a note);
- for a **penalty notice**, **warning** or **court referral**: the addressee is identified with an
  address;
- for **no further action**: a reason is recorded (e.g. owner couldn't be traced, evidence
  insufficient).

## 7. Repeat offenders

- Each vehicle and person page shows its cases, outcomes, notices and points.
- A case shows a **repeat-offender banner** when the vehicle or the person has **3 or more cases
  with enforcement outcomes in the last 12 months** (D04-4). It informs the decision (e.g. not a
  warning); it doesn't change rules automatically.

## 8. Edge cases

| Situation | Rule |
|---|---|
| **Vehicle sold** around the offence date | The owner on the offence date is responsible; the officer records both owners and dates. |
| **False or cloned plate** — registry vehicle doesn't match the evidence (type, colour, make) | Flag `suspected_false_plate`; no notice to the registered owner; the case goes to court referral or NFA with a reason; HQ alerted. |
| **Stolen vehicle** | Flag `reported_stolen` with the complaint reference; no notice to the owner for offences after the theft date. |
| Owner **abroad** or **deceased** | NFA with reason, or court referral if the driver is known. |
| **Government / diplomatic** vehicle | `special` plate category (HQ approval); routed to HQ for a decision. |
| Plate **unknown** but vehicle well described | Officer may trace by other means; otherwise NFA with reason. |
| Owner **disputes** the registry record | Officer records the statement; correction per V5. |

## 9. Privacy and access

- Person records are visible to **HQ** and to the **station handling a case** that involves them
  ([01](01-roles-and-permissions.md) matrix). Every view is logged ([10](10-evidence-audit-and-privacy.md)).
- The reporter never sees any of it.
- Retention rules are set in [10](10-evidence-audit-and-privacy.md) *(planned)*.

## 10. Loopholes this closes

| Loophole | Closed by |
|---|---|
| Fines issued to nobody | Addressee required before recommending (§6) |
| Fining the wrong owner after a sale | Owner on the offence date (V4) |
| Fining the owner of a cloned plate | Evidence-vs-registry check, `suspected_false_plate` (§8) |
| Duplicate person records hiding repeat offending | Search before create, HQ merge (P1–P2) |
| Stale owner data reused forever | 6-month re-check (V2) |
| Silent edits to who is responsible | Audited corrections; notice process after issue (V5) |

## 11. Decisions

All decisions agreed on 2026-10-20 as recommended.

| # | Decision | Agreed |
|---|---|---|
| D04-1 | Build our own vehicle and person register from officer look-ups | **Yes** (agreed in principle earlier; confirms the details above). |
| D04-2 | How long a traced owner can be reused without re-checking | **6 months.** |
| D04-3 | Organisations as owners, required to name the driver | **Yes.** |
| D04-4 | Repeat-offender threshold for the banner | **3 enforcement outcomes in 12 months.** |
| D04-5 | Special plates (diplomatic, military) | **Allowed with HQ approval**, decided by HQ. |
| D04-6 | Statements as attachments plus a written summary | **Yes.** |
| D04-7 | Who sees person records | **HQ and the handling station only**, every view logged. |

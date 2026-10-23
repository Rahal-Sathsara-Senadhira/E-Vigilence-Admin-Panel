# E-Vigilance — Documentation

E-Vigilance is the Sri Lanka Police traffic-enforcement admin panel: it takes reports of traffic
offences (above all from citizens using the **E-Vigilance mobile app**, but also from officers and
cameras), lets HQ triage them, sends cases to the right
police station, supports the investigation, and records the lawful outcome — a penalty notice, a
court case, a warning, or a reasoned decision to take no action. Citizens whose tips prove correct
are rewarded ([16](16-citizen-rewards.md)).

This folder is the **source of truth for how the system should behave**. Code follows these
documents, not the other way round.

## How these documents are made

Each piece goes through the same steps before any code is written:

1. **Draft** — purpose, rules, states, edge cases and loopholes, and the decisions needed (each
   with a recommendation).
2. **Review** — the product owner answers the open decisions.
3. **Agreed** — the decisions are written into the rules; the document becomes the reference.
4. **Built** — the code implements it; the document links to the code and tests.

A piece is only built once every piece it depends on is **Agreed**.

## Pieces

| # | Document | Status | Depends on |
|---|---|---|---|
| 00 | [Overview and glossary](00-overview-and-glossary.md) | **Agreed** | — |
| 01 | [Roles and permissions](01-roles-and-permissions.md) | **Agreed** | 00 |
| 02 | [Reports and triage](02-reports-and-triage.md) | **Agreed** | 01 |
| 03 | [Cases and dispatch](03-cases-and-dispatch.md) | **Agreed** | 02 |
| 04 | [Investigation: vehicles and people](04-investigation-vehicles-and-people.md) | **Agreed** | 03 |
| 05 | [Outcomes and penalty notices](05-outcomes-and-penalty-notices.md) | **Agreed** | 04 |
| 06 | [Court cases](06-court-cases.md) | **Agreed** | 05 |
| 07 | [Payments and the payment simulator](07-payments-and-simulator.md) | **Agreed** | 05 |
| 08 | [Demerit points](08-demerit-points.md) | **Agreed** | 05, 06 |
| 09 | [Time limits and notifications](09-time-limits-and-notifications.md) | **Agreed** | 02–07 |
| 10 | [Evidence, audit and privacy](10-evidence-audit-and-privacy.md) | **Agreed** | 02–05 |
| 11 | [Mobile app integration](11-citizen-app-integration.md) | **Agreed** | 02, 09, 16 |
| 12 | [Dashboards and reports](12-dashboards-and-reports.md) | **Agreed** | 02–09, 13, 16 |
| 13 | [Design system](13-design-system.md) | **Agreed** | — |
| 14 | [Data model and migration](14-data-model-and-migration.md) | **Agreed** | 01–12, 16 |
| 15 | [Build plan](15-build-plan.md) | **Agreed** | all |
| 16 | [Citizen rewards](16-citizen-rewards.md) | **Agreed** | 02, 05, 07 |
| 17 | [Architecture and technology stack](17-architecture-and-stack.md) | **Agreed** | 14, 15 |

Working order: 00 → 01 → 02 → 03 → 04 → 05 → 06 → 07 → 16 → 09 → 10 → 08 → 11 → 13 → 12 → 14 → 15 → 17.

## Related documents

- [`../ENFORCEMENT_DESIGN.md`](../ENFORCEMENT_DESIGN.md) — the one-page summary of the agreed
  direction (reports vs cases, outcomes, simulator). The pieces here expand it.
- [`../PROJECT_STORYLINE.md`](../PROJECT_STORYLINE.md) — history: how the system evolved and the
  loopholes fixed along the way.
- [`../VIOLATIONS_BUSINESS_LOGIC.md`](../VIOLATIONS_BUSINESS_LOGIC.md) — earlier design, partly
  superseded.

## Conventions

- **Must / must not** are rules the system enforces. **Should** is the expected behaviour that
  can be overridden with a recorded reason.
- Every rule names who it applies to, using the role names in [01](01-roles-and-permissions.md).
- Values that depend on law or policy (fine amounts, deadlines) are **settings**, shown with a
  placeholder default and marked *to be confirmed*.
- Decisions are numbered per document (`D01-3` = document 01, decision 3) so they can be
  referenced in reviews and commits.

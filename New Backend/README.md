# E-Vigilance — backend

Express 5, JavaScript (type-checked with JSDoc), MongoDB. Plan: [docs/19](../docs/19-new-backend-plan.md) ·
roles: [docs/20](../docs/20-roles-v2.md) · to-do: [TODO.md](../TODO.md).

## Run it

```sh
npm install
cp .env.example .env       # fill in MongoDB, secrets and SEED_PASSWORD
npm run seed               # demo divisions, stations and one account per role
npm run dev                # http://localhost:4200/api/v1/health
```

The panel (`New Frontend/`) runs on port 5300 and reaches this backend through its dev server.

## Scripts

| Script          | Does                                                            |
| --------------- | --------------------------------------------------------------- |
| `npm run dev`   | Starts the backend and restarts it on changes                   |
| `npm test`      | API tests against an in-memory MongoDB (never Atlas)            |
| `npm run check` | Lint, type check and formatting — must be clean before a commit |
| `npm run seed`  | Demo data; `-- --reset-passwords` resets the demo passwords     |

## Demo accounts

Password: the `SEED_PASSWORD` in `.env`. Sign in with the email or the service number.

| Role                        | Email                           | Service number |
| --------------------------- | ------------------------------- | -------------- |
| System administrator        | sysadmin@evigilance.local       | —              |
| HQ administrator            | hq.admin@evigilance.local       | HQ1001         |
| HQ operator                 | hq.operator@evigilance.local    | HQ1002         |
| HQ supervisor               | hq.supervisor@evigilance.local  | HQ1003         |
| Finance officer             | finance@evigilance.local        | —              |
| Auditor                     | auditor@evigilance.local        | —              |
| Executive viewer            | executive@evigilance.local      | HQ1004         |
| Division supervisor (Kandy) | division.kandy@evigilance.local | KD2001         |
| Station OIC (Kandy)         | oic.kandy@evigilance.local      | KD3001         |
| Traffic officer (Kandy)     | officer.kandy@evigilance.local  | KD3002         |
| Station clerk (Kandy)       | clerk.kandy@evigilance.local    | KD3003         |

National roles and the division supervisor set up two-step sign-in (an authenticator app) the
first time they sign in.

## Structure

```
src/
├─ server.js · app.js       start-up; the Express app
├─ config/env.js            every setting, checked at start-up
├─ core/                    no business rules: errors, http, db, auth, access (roles and
│                           permission matrix), audit log
└─ modules/<area>/          routes → controller → service → model, plus schemas, views, policy
```

Rules (docs/19 §4.2): routes declare who may use them or the app won't start; services never see
`req`/`res`; every change runs in a transaction with its audit entry; `core/` never imports a module.

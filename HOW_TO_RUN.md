# How to run E-Vigilance locally

This guide runs the **new system**:

| Part             | Folder          | Tech                         | Address                                     |
| ---------------- | --------------- | ---------------------------- | ------------------------------------------- |
| Backend (API)    | `New Backend/`  | Express 5, MongoDB (Atlas)   | http://localhost:4200/api/v1/health         |
| Staff panel (UI) | `New Frontend/` | React 19, Vite, Tailwind CSS | http://localhost:5300                       |

The panel's dev server forwards every `/api` request to the backend on port 4200, so you only ever
open port 5300 in the browser.

> `Backend/` and `Frontend/` are the old, frozen system. `apps/` + `packages/` are a separate pnpm
> workspace. Neither is needed for this guide.

---

## 1. Prerequisites

| Tool             | Version                    | Check with       |
| ---------------- | -------------------------- | ---------------- |
| Node.js          | **24** (see `.nvmrc`)      | `node --version` |
| npm              | comes with Node            | `npm --version`  |
| Internet access  | to reach MongoDB Atlas, R2 | —                |

Node 22.18 also works: `npm install` prints an `EBADENGINE` warning, which you can ignore. Node 24
is still recommended. Get it from https://nodejs.org or `winget install OpenJS.NodeJS`.

**MongoDB Atlas network access:** your computer's IP address must be allowed in Atlas
(_Network Access → IP Access List_). Otherwise the backend stops with a connection timeout.

---

## 2. Create the backend settings file (`New Backend/.env`)

The backend reads its settings from `New Backend/.env` and checks every value at start-up. A
missing or wrong value stops it with a clear message.

```powershell
cd "New Backend"
Copy-Item .env.example .env      # only if .env doesn't exist yet
```

Then fill it in:

| Setting                       | What it is                                                             | Required |
| ----------------------------- | ---------------------------------------------------------------------- | -------- |
| `MONGODB_URI`                 | Atlas connection string (`mongodb+srv://user:password@cluster…`)       | Yes      |
| `MONGODB_DB_NAME`             | Database name: `evigilance_new`                                        | Yes      |
| `JWT_SECRET`                  | Signs sign-in tokens. 32+ random characters                            | Yes      |
| `MFA_ENCRYPTION_KEY`          | Encrypts two-step sign-in secrets. Exactly 64 hex characters           | Yes      |
| `PAYMENTS_SIM_SECRET`         | Signs payment-simulator confirmations. 32+ characters                  | Yes      |
| `PORT`                        | Backend port: `4200`                                                   | Yes      |
| `WEB_ORIGIN`                  | The panel's address: `http://localhost:5300`                           | Yes      |
| `R2_ENDPOINT`                 | Cloudflare R2 endpoint URL                                             | For R2   |
| `R2_ACCESS_KEY`               | R2 access key ID                                                       | For R2   |
| `R2_SECRET_KEY`               | R2 secret access key                                                   | For R2   |
| `R2_BUCKET_NAME`              | R2 bucket: `e-vigilance`                                               | For R2   |
| `R2_PREFIX`                   | Folder for this build's files. Write it **in quotes**: `"new e-vigilence/"` | For R2   |
| `APP_IMPORT_INTERVAL_SECONDS` | How often to import mobile-app reports (seconds; `0` = off)            | No (60)  |
| `APP_MEDIA_ALLOWED_HOSTS`     | Hosts app evidence may be downloaded from (production only)            | No       |
| `APP_MEDIA_KEY`               | The mobile app's `MEDIA_SERVICE_KEY`, sent as `X-Media-Key`            | No       |
| `APP_R2_PREFIX`               | The app's folder in the shared R2 bucket: `evidence/`                  | No       |
| `SEED_PASSWORD`               | Password given to the demo accounts. 12+ characters                    | For seed |

If the four `R2_*` settings are missing, evidence files go to a local folder
(`New Backend/.data/evidence`) instead of R2.

To generate new secrets:

```powershell
# JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# MFA_ENCRYPTION_KEY and PAYMENTS_SIM_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **Never commit `.env`.** It is already listed in `.gitignore`. If you change
> `MFA_ENCRYPTION_KEY` later, existing two-step sign-in setups stop working and have to be redone.

The panel (`New Frontend/`) needs **no** `.env` file for local development.

---

## 3. Install dependencies (first time, and after `package.json` changes)

Use two separate folders, each with its own `npm install`:

```powershell
cd "New Backend"
npm install

cd "..\New Frontend"
npm install
```

---

## 4. Add the demo data (first time only)

```powershell
cd "New Backend"
npm run seed
```

This creates demo divisions, stations and one account per role. You can run it again safely: it
keeps existing records and doesn't change existing passwords. To set every demo password back to
`SEED_PASSWORD`, run:

```powershell
npm run seed -- --reset-passwords
```

> The `evigilance_new` database on the current Atlas cluster **already has** the demo data
> (11 demo accounts, 44 divisions, 319 stations), so you can skip this step there.

---

## 5. Start the backend (terminal 1)

```powershell
cd "New Backend"
npm run dev
```

Wait for these two lines:

```
"msg":"Database connected"
"msg":"E-Vigilance backend on http://localhost:4200"
```

Check it: open http://localhost:4200/api/v1/health. It should show
`{"status":"ok","database":"up"}`.

`npm run dev` restarts the backend automatically when you save a file. Leave this terminal open.

---

## 6. Start the staff panel (terminal 2)

```powershell
cd "New Frontend"
npm run dev
```

Wait for:

```
VITE v8.x  ready in … ms
➜  Local:   http://localhost:5300/
```

---

## 7. Open the panel and sign in

Open **http://localhost:5300**. Sign in with an email **or** a service number. The password is the
`SEED_PASSWORD` from `New Backend/.env`.

| Role                        | Email                             | Service no. | Two-step sign-in |
| --------------------------- | --------------------------------- | ----------- | ---------------- |
| System administrator        | `sysadmin@evigilance.local`       | —           | Yes              |
| HQ administrator            | `hq.admin@evigilance.local`       | HQ1001      | Yes              |
| HQ operator                 | `hq.operator@evigilance.local`    | HQ1002      | Yes              |
| HQ supervisor               | `hq.supervisor@evigilance.local`  | HQ1003      | Yes              |
| Finance officer             | `finance@evigilance.local`        | —           | Yes              |
| Auditor                     | `auditor@evigilance.local`        | —           | Yes              |
| Executive viewer            | `executive@evigilance.local`      | HQ1004      | Yes              |
| Division supervisor (Kandy) | `division.kandy@evigilance.local` | KD2001      | Yes              |
| Station OIC (Kandy)         | `oic.kandy@evigilance.local`      | KD3001      | No               |
| Traffic officer (Kandy)     | `officer.kandy@evigilance.local`  | KD3002      | No               |
| Station clerk (Kandy)       | `clerk.kandy@evigilance.local`    | KD3003      | No               |

**Two-step sign-in:** the first time one of these accounts signs in, the panel shows a QR code.
Scan it with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…) and enter
the 6-digit code. Save the recovery codes it shows you. For a quick look without a phone, use one
of the station accounts (`officer.kandy…`, `oic.kandy…`, `clerk.kandy…`).

---

## 8. Stop

Press `Ctrl + C` in each terminal.

---

## Every day after the first time

```powershell
# terminal 1
cd "New Backend";  npm run dev
# terminal 2
cd "New Frontend"; npm run dev
```

Then open http://localhost:5300.

---

## Troubleshooting

| Problem                                                                  | Fix                                                                                                                                                       |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `The backend settings are not valid: - X: …`                             | Fix setting `X` in `New Backend/.env`, as the message says.                                                                                               |
| `MongooseServerSelectionError` / timeout after ~10 s                     | Your IP isn't on the Atlas IP Access List, the password in `MONGODB_URI` is wrong, or there's no internet.                                                |
| `EADDRINUSE: … :4200` or `Port 5300 is in use`                           | An old server is still running. Find it with `netstat -ano \| findstr :4200` (or `:5300`), then `taskkill /PID <pid> /F`.                                 |
| Panel loads but sign-in fails with a network error                       | The backend isn't running. Start it first (step 5).                                                                                                       |
| `This request is missing a security header` when calling the API by hand | Expected. Every `POST/PUT/PATCH/DELETE` needs the header `X-Requested-With: e-vigilance`. The panel sends it for you.                                     |
| Wrong password for a demo account                                        | Run `npm run seed -- --reset-passwords` in `New Backend/`.                                                                                                |
| Lost the authenticator for a demo account                                | Sign in with a saved recovery code, or ask a system administrator to reset two-step sign-in for that account.                                             |
| `npm warn EBADENGINE … required: { node: '>=24' }`                       | Harmless on Node 22. Install Node 24 to get rid of it.                                                                                                    |

---

## Other useful commands

Run these in `New Backend/`:

| Command                        | Does                                                                     |
| ------------------------------ | ------------------------------------------------------------------------ |
| `npm test`                     | API tests against an in-memory MongoDB (never touches Atlas)             |
| `npm run check`                | Lint, type check and formatting (must be clean before a commit)          |
| `npm run seed:reports`         | Adds demo reports (needs the seed and the reference data first)          |
| `npm run seed:app-reports`     | Adds demo mobile-app reports; the running backend imports them within a minute |
| `npm run import-reference-data`| Dry run: shows what the import of divisions, stations, courts and offences would change. Add `-- --apply` to write |

Run these in `New Frontend/`:

| Command           | Does                                                             |
| ----------------- | ---------------------------------------------------------------- |
| `npm run build`   | Production build in `dist/`                                      |
| `npm run check`   | Lint (including import boundaries), type check and formatting    |

Deployment (Railway + Vercel) is described in [docs/22](docs/22-deployment.md).

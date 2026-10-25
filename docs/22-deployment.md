# 22 — Deployment: Railway (backend) and Vercel (frontend)

**Status:** Ready to try · **Last updated:** 2026-10-24

The new build runs as two services:

| Part | Host | Folder | Address (example) |
|---|---|---|---|
| Backend (API) | **Railway** | `New Backend` | `https://e-vigilance-api.up.railway.app` |
| Frontend (panel + public pages) | **Vercel** | `New Frontend` | `https://e-vigilance.vercel.app` |
| Database | MongoDB Atlas | — | (existing cluster) |
| Evidence and receipt scans | Cloudflare R2 | — | bucket, folder `new e-vigilence/` |

**How they talk.** The browser only ever talks to the Vercel address. Vercel forwards every
`/api/…` request to Railway (a *rewrite*). So the panel and the API look like one site to the
browser: the sign-in cookie stays first-party and strict, and no cross-site cookie settings are
needed.

```
browser ──► Vercel ──(/api/*)──► Railway ──► Atlas
                                      └────► R2
```

Deploy the backend first (you need its address for the frontend), then the frontend, then come
back and tell the backend the frontend's address.

---

## 1. Backend on Railway

1. **New project** → *Deploy from GitHub repo* → choose `E-Vigilence-Admin-Panel`.
2. Service → **Settings → Source → Root directory**: `New Backend`.
   Railway reads `New Backend/railway.json`: start command `npm start`, health check
   `/api/v1/health`, restart on failure, **one** instance.
3. Service → **Variables** — add each (values from your password manager; never commit them):

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `MONGODB_URI` | the Atlas connection string |
   | `MONGODB_DB_NAME` | `evigilance_new` (or the production database name) |
   | `JWT_SECRET` | 48+ random characters — **new for production**, not the development one |
   | `MFA_ENCRYPTION_KEY` | 64 hex characters — **new for production** |
   | `PAYMENTS_SIM_SECRET` | 64 hex characters — **new for production** |
   | `R2_ENDPOINT`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET_NAME` | the R2 bucket |
   | `R2_PREFIX` | `new e-vigilence/` |
   | `WEB_ORIGIN` | the Vercel address, e.g. `https://e-vigilance.vercel.app` (set after step 2.6) |
   | `TRUST_PROXY_HOPS` | `2` (Vercel + Railway in front of the API) |
   | `APP_IMPORT_INTERVAL_SECONDS` | `0` until the mobile app's media hosts are known; then `60` |
   | `APP_MEDIA_ALLOWED_HOSTS` | the mobile app's media host names, and `.r2.cloudflarestorage.com` when the app stores media in R2 (when importing) |
   | `APP_MEDIA_KEY` | the app's `MEDIA_SERVICE_KEY` — needed once the app sets `MEDIA_ACCESS=signed` |
   | `APP_R2_PREFIX` | `evidence/` when the app shares our R2 bucket (its `R2_PREFIX` and `/`); empty if it doesn't |
   | `LOG_LEVEL` | `info` |

   `PORT` is set by Railway itself. Generate secrets with
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

   **Why new secrets:** changing `MFA_ENCRYPTION_KEY` later locks everyone out of two-step
   sign-in; using the development keys in production means anyone with the development `.env`
   could forge sign-ins. Choose them once, keep them safe.

4. **Settings → Networking → Generate domain.** Note the address (e.g.
   `e-vigilance-api.up.railway.app`).
5. **Atlas → Network Access:** Railway's outgoing addresses change, so either allow
   `0.0.0.0/0` (with a strong database password, Atlas user limited to this database), or use
   Railway's static outgoing IPs (paid plans) and allow only those.
6. Open `https://<railway domain>/api/v1/health` — expect `{"status":"ok","database":"up"}`.
   If the deploy fails, the log names the missing or wrong variable.

**The backend refuses to start** in production without the payment secret, without R2 (the
host's disk is wiped on every deploy), or with the mobile-app import on but no allowed media
hosts. That is on purpose.

### First-time data (once, from your computer)

With the production variables in a local file that is **not** in the repository (e.g.
`New Backend/.env.production`, ignored by git):

```
cd "New Backend"
node --env-file=.env.production scripts/import-reference-data.js --apply   # divisions, stations, offences
node --env-file=.env.production scripts/create-main-admin.js               # the main administrator (docs/21 §4.4)
```

Never run `seed`, `seed:reports` or `seed:app-reports` against production — they refuse to.

## 2. Frontend on Vercel

1. **Add New → Project** → import `E-Vigilence-Admin-Panel`.
2. **Root directory:** `New Frontend`. Framework: Vite (read from `vercel.json`).
3. Edit `New Frontend/vercel.json` — replace `REPLACE-WITH-YOUR-RAILWAY-DOMAIN.up.railway.app`
   with the Railway domain from step 1.4, commit and push.
4. **Environment variables:** none needed. Optional: `VITE_UPLOAD_ORIGIN` — see §3.
5. Deploy. Note the address (e.g. `https://e-vigilance.vercel.app`).
6. Back on Railway, set `WEB_ORIGIN` to that address and redeploy the backend.

`vercel.json` also: sends every page address to the app (so `/cases/…`, `/notice`,
`/pay/sim/…` load on refresh), caches built assets for a year, and adds security headers.

## 3. Large uploads

Evidence videos can be up to 500 MB. Vercel may cap the size of a request it forwards (it caps
its own functions at 4.5 MB; for forwarding to another server this is not documented). **Test
it:** upload a 10 MB video on a report after deploying.

If it fails, set on Vercel `VITE_UPLOAD_ORIGIN=https://<railway domain>` and redeploy the
frontend. Uploads then go straight to Railway. The backend accepts direct calls only from
`WEB_ORIGIN`, and never with cookies — uploads carry the sign-in token instead, so nothing else
changes.

## 4. After deploying — check

- [ ] `https://<vercel>/api/v1/health` answers (the rewrite works).
- [ ] Sign in as the main administrator; set up two-step sign-in.
- [ ] Refresh a page while signed in — still signed in (the cookie works through Vercel).
- [ ] Create a report with a photo (R2 works); open the photo.
- [ ] Open `https://<vercel>/notice` signed out — the look-up page loads.
- [ ] Wrong sign-in password 5 times from one browser — locked out, but **only** that
      account/address (if everyone is blocked, `TRUST_PROXY_HOPS` is wrong).

## 5. Limits of this setup (TODO.md)

- **One backend instance.** Background jobs (mobile-app import, sweeps) and the rate limits run
  inside the process. Before scaling to two instances, move the rate limits and job locks to
  MongoDB or Redis.
- **SMS** wait in the outbox until a gateway is connected (N7).
- **Payments** are in test mode (docs/07) until the GovPay agreement.
- `TRUST_PROXY_HOPS=2` trusts the client address Vercel passes on. Someone calling the Railway
  address directly could fake it; keep the Railway address unpublished, or later restrict it to
  Vercel's traffic.

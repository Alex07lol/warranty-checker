# WarrantyVault — Production Operations

Practical operations knowledge for anyone running WarrantyVault in production
(Render free tier + MongoDB Atlas + Cloudinary). No fake guarantees: where a
capability does not exist, this document says so and gives the workaround.

---

## 1. Production checklist

Run through this before/after any deployment.

### Environment (Render dashboard → Environment)

| Var | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` (set in `render.yaml`) |
| `PORT` | no | Render injects it — do **not** set it |
| `MONGO_URI` | yes | Atlas connection string (`mongodb+srv://…`) |
| `JWT_SECRET` | yes | ≥ 32 random chars; `openssl rand -hex 32` |
| `JWT_EXPIRES_IN` | yes | duration format only: `15m`, `7d` — never `7 days` |
| `CLOUDINARY_CLOUD_NAME` / `API_KEY` / `API_SECRET` | yes | from Cloudinary dashboard |
| `CLIENT_URL` | yes | **specific origin** (`https://app.example.com`) — `*` fails boot in production |
| `GOOGLE_PLACES_API_KEY` | no | without it Places returns 503; Nominatim geocoding still works |
| `OCR_MAX_CONCURRENT` | no | default 2 (free-tier friendly) |
| Rate-limit overrides | no | `AUTH_RATE_LIMIT`, `UPLOAD_RATE_LIMIT`, `OCR_RATE_LIMIT`, `PLACES_RATE_LIMIT` |

Secrets live only in Render's env — never in git, README, tests, logs, or
frontend JS. `.env.example` documents names and safe placeholders only.

### Database (MongoDB Atlas)

- Free-tier M0 cluster; `warrantyvault_db` database.
- Indexes build automatically on boot (including the partial unique
  `{ userId, serialNumber }` index for active products).
- If the index build warns about existing duplicates, clean duplicates first
  (see §2 recovery).

### Cloudinary

- Uploads use `resource_type: auto`; **PDFs are stored as image resources** —
  always destroy with `resource_type: "image"` (the `raw` type silently
  orphans PDFs).
- This account's media delivery ACL blocks direct PDF delivery — the app uses
  the Admin API download endpoint server-side (document view + OCR retries).

### Render

- Blueprint: `render.yaml` at repo root → New → Blueprint → apply → fill
  secrets → deploy. Build: `npm install`; start: `node src/server.js`.
- Health check: `GET /health` (liveness). `GET /ready` reports MongoDB
  reachability (200/503).
- Free tier: sleeps after ~15 min idle → cold start ~1 min. `serverSelectionTimeoutMS`
  is 15 s to tolerate Atlas cold starts.
- Node version: pinned by `engines` + CI (Node 20+).

### Checks

```bash
npm test            # full suite (161+ tests, in-memory MongoDB)
npm run ocr:sim     # OCR parser simulation (55 scenarios)
npm run smoke       # live API smoke (register/login/products/uploads) — needs a running server + env
curl <app>/health   # liveness
curl <app>/ready    # readiness (db up/down)
```

---

## 2. Backup and recovery

### MongoDB

- **Configured:** none beyond Atlas free-tier's built-in snapshots (Atlas M0
  keeps a rolling ~24 h of daily snapshots for a few days, no point-in-time
  restore, no manual export scheduled).
- **What to do if the DB is lost:** data is user-generated; the loss window is
  acceptable for a demo, but to be safe:
  1. Enable an Atlas backup tier or schedule a manual export:
     ```bash
     mongodump --uri="$MONGO_URI" --out=./backup-$(date +%F)
     ```
     (Restore: `mongorestore --uri="$MONGO_URI" ./backup-…/warrantyvault_db`)
  2. Cloudinary files are referenced by `publicId` — restoring DB rows restores
     the whole product/document relationship.

### Cloudinary

- Files are not backed up separately; the Cloudinary asset is the source of
  truth for binaries. Deleting a document deletes the asset first
  (`destroy`), then the DB row — a failure in between can orphan a file.
- Recovery: re-upload from the user, or restore from Cloudinary's own trash
  retention if enabled.

### Render / environment

- **Render service recreated:** apply the blueprint again (`render.yaml`),
  re-enter the secret env vars, redeploy. Data is untouched (Atlas/Cloudinary).
- **Env vars lost:** regenerate `JWT_SECRET` (all sessions invalidate — users
  re-login), re-enter Cloudinary keys, `MONGO_URI`, `CLIENT_URL`. Keep a copy
  of the values in a password manager, never in the repo.

---

## 3. Security notes (how it's actually protected)

- **Authentication:** JWT bearer tokens (7 d default lifetime), stored in
  `localStorage` client-side; logout removes the token locally (stateless —
  no server-side revocation). Passwords hashed with bcrypt (cost 12).
- **Authorization:** every resource query is scoped to `req.user.userId`
  (products, documents, service history, notifications, document streaming).
  Verified by cross-user tests.
- **Input validation:** Joi on every body; magic-byte file-signature checks on
  uploads (not just MIME); ObjectId validation on all :id params.
- **Rate limiting:** auth (10/15 min), uploads (10/min), OCR (15/10 min),
  Places (120/15 min) — env-overridable, keyed per user/IP.
- **CORS/CSP:** Helmet security headers; production refuses a wildcard
  `CLIENT_URL` at boot.
- **Secrets:** only in Render env vars / local `.env` (git-ignored); never
  logged. Request logs carry `requestId` + method/url/status/duration only.
- **External APIs:** Google Places proxied server-side with validated inputs
  and safe error mapping (no raw upstream errors, no API-key URLs in logs);
  Nominatim fallback for geocoding.

---

## 4. Monitoring & tracing (honest)

- **No external monitoring/APM** (free tier). Tracing path:
  `user reports error → X-Request-ID → server logs → exact request`.
  Every response carries `X-Request-ID`; every log line and error payload
  includes it.
- **OCR metrics** are exposed on `/health` (`started/completed/failed`,
  `active/queued`, `maxConcurrent`) — counters only, no contents/PII.
- **Logging:** structured JSON on stdout/stderr. Never log passwords, tokens,
  authorization headers, Cloudinary/Google secrets, or document contents.

---

## 5. Architecture decisions worth defending

- **OCR stays in-process** — a queue/worker (Redis/BullMQ) is *not* warranted:
  expected load is a handful of scans per user, tesseract already runs through
  a single reusable worker, and an in-process semaphore (`OCR_MAX_CONCURRENT=2`)
  caps CPU. Adding a queue would add infrastructure and cold-start cost with no
  measured benefit.
- **Health vs readiness are separate** — `/health` (liveness, always 200 while
  the process runs) is what Render polls; `/ready` (readiness, 503 when MongoDB
  is down) tells orchestrators traffic should wait.

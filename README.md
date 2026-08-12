# WarrantyVault

WarrantyVault is a **web-based digital ownership and warranty management platform**. It gives you one secure place to store receipts, warranty cards, manuals, serial numbers, and service history for every product you own — then automatically tracks warranty expiry, notifies you before coverage lapses, and helps you find repair centres when something breaks. Built for anyone who wants to stop losing warranty paperwork and start managing their products like a grown-up asset register.

> **Note (August 2026):** the project is **web-only**. The earlier Flutter/Android app was removed; the frontend is a static HTML/CSS/JS app served directly by the Express API. The old mobile code remains recoverable from git history.

---

## Table of Contents

- [Demo](#demo)
- [Screenshots](#screenshots)
- [What WarrantyVault Does](#what-warrantyvault-does)
- [Features](#features)
- [Security](#security)
- [Privacy & Data Architecture](#privacy--data-architecture)
- [Technology Stack](#technology-stack)
- [Repository Structure](#repository-structure)
- [Getting Started](#getting-started)
- [API Overview](#api-overview)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Documentation](#documentation)
- [License](#license)

---

## Demo

**Live demo:** https://warranty-checker.onrender.com/

The demo runs on Render's free tier (MongoDB Atlas + Cloudinary). You can explore the entire application **without creating an account** — guest mode gives you a read-only tour of the dashboard, products, scan/OCR flow, notifications, service history, and repair-centre finder. Sign up for free to unlock writing (products, documents, OCR, service records, sharing).

Note that the free tier sleeps after ~15 minutes of inactivity, so the first page load may take up to a minute to wake up.

---

## Screenshots

Screenshots are not yet committed to the repository. Representative views to capture (then add to `assets/images/` and reference here):

| View | What it shows |
|---|---|
| Dashboard | Stats (active/expiring/expired warranties, documents), expiring-soon list, recent products |
| Products | Product cards with warranty-status badges, advanced filters, tag chips |
| Scan / OCR | Upload area, extraction summary with copy buttons, edit-and-confirm step |
| Product detail | Warranty overview, coverage periods, documents, service timeline, claim prep |
| Repair Centres | Nearby repair shops with photos, ratings, phone/call actions |
| Notifications | Notification center with type-aware icons and settings toggles |
| Shared page | The public read-only `shared.html` snapshot of a shared product |

Until the images exist, this section is intentionally a placeholder — no fake screenshots.

---

## What WarrantyVault Does

The core workflows, end to end:

1. **Add or manage products** — name, brand, model, category, serial number, purchase date/price/store, photos, and more.
2. **Store documents** — receipts, warranty cards, product photos, manuals, and PDFs, organized per product (or standalone).
3. **Extract warranty info with OCR** — upload a photo or PDF and WarrantyVault reads product name, brand, model, serial number, purchase date/store/price, and warranty details.
4. **Review and confirm** — OCR results are staged for your approval; you fix any misreads before a product is created. Nothing is auto-created behind your back.
5. **Track warranty status** — every product shows a centralized status: **Active · Expiring soon · Expired · Not started · Unknown**, plus multiple coverage periods where applicable.
6. **Receive notifications** — expiry reminders, maintenance due, document-processing updates, and share activity, on your schedule.
7. **Maintain service history** — log repairs, maintenance, inspections, costs, providers, and next-service dates.
8. **Find nearby repair centres** — location-aware search with ratings, photos, opening hours, and call/directions actions.
9. **Organize documents** — document states (unreviewed/reviewed/important/archived), manual verification, tags, and notes.
10. **Prepare warranty claims** — one-click structured claim summary with all relevant product, warranty, document, and service data.
11. **Export product data** — full ownership data as CSV or JSON, scoped to your account.
12. **Share a product securely** — revocable, expiring, read-only share links for repair technicians or family.

---

## Features

### Product Management

- Create, edit, and **soft-delete** products (deletion preserves history; serial numbers become reusable)
- Full-text search plus extended search over name, brand, model, serial number, store, provider, and tags
- Categories and **user-scoped tags** (add/remove/filter/search)
- **Lifecycle states**: owned · in use · stored · under repair · sold · gifted · disposed — changing state never destroys documents or history
- **Warranty status** computed by one centralized engine shared by backend and frontend
- **Multiple coverage periods** per product (e.g. standard + extended + accidental damage), each with type, provider, dates, coverage, and status
- **Warranty provider info**: provider name, type (manufacturer/retailer/third-party/extended), contact, and website
- **Advanced server-side filtering**: category, brand, lifecycle, warranty status, tags, store, provider, price range, and date ranges — combined safely
- Dashboard widgets: warranty health counts, coverage value, expiring-soon, high-value items

### OCR & Document Processing

- Supported inputs: **JPEG, PNG, WebP, and PDF** (up to 5 MB)
- **PDF text-layer extraction** when present (fast, accurate) with automatic fallback to **page rasterization + Tesseract OCR** for scanned PDFs
- Extracted fields: product name, **brand** and **model** (split cleanly), serial number, purchase date, purchase store, purchase price, and warranty/provider data
- **Review-and-confirm workflow** — OCR stages data on the document; you correct misreads before a product is created (with an edit-and-confirm step)
- Failure and retry handling — OCR never leaves a document stuck in `processing`, and retries work after a failure
- `document_processing` notifications on completion or failure
- **No accuracy claims are made** — OCR is best-effort extraction designed for human review, not a guarantee

### Warranty Management

- Warranty start/end dates and warranty-period months
- **Centralized warranty-status engine** — one source of truth for `not_started | active | expiring_soon | expired | unknown`, mirrored identically on frontend and backend with a CI drift guard
- Expiring-soon detection (30-day window) on the dashboard and via notifications
- Warranty provider fields (name, type, contact, website)
- Multiple coverage periods (see Product Management)
- **Warranty Health / intelligence** (deterministic, **not AI**): conflict detection (e.g. expiry before purchase), missing-information nudges (e.g. "add an expiry to enable reminders"), and duplicate-product suggestions (same serial, or brand + model + store within ~90 days) — via `GET /api/v1/products/:id/intelligence`

### Service & Maintenance

- Service records: date, type, provider, cost, currency, description, and **next-service date**
- Full per-product service timeline (newest first)
- **Maintenance reminders** — a nightly scheduler creates `service_reminder` notifications from `nextServiceDate`, respecting per-user preferences and avoiding duplicates

### Notifications

- Types: `warranty_expiry` · `service_reminder` · `document_processing` · `shared_access` · `system`
- Warranty expiry reminders at **user-configurable intervals** (default: 30/7/1 days before)
- Maintenance/service reminders
- Document-processing updates (OCR done or failed)
- Share-link activity notifications
- Read/unread state, mark-read, mark-all-read, delete
- **Notification preferences**: per-type toggles (expiry, maintenance, document processing, shared access) + custom reminder-day schedules

### Repair Centres

- Nearby repair-centre lookup from your location
- Google Places integration proxied server-side (API key never reaches the browser)
- Reverse geocoding (Google + OpenStreetMap Nominatim fallback)
- Place details: phone numbers, opening hours, ratings, website, and canonical Maps link
- Photo proxying for store images
- Call / directions actions from the UI

### Secure Sharing

- Per-product share links (one link = one product)
- **Read-only by default** — public snapshot contains product, warranty, service, and document **metadata only**; never file bytes, OCR text, or unrelated data
- **Unguessable tokens** (48 hex chars) — no enumerable public URL space
- **Optional expiry** (1–90 days) and **instant revocation**
- Standalone `shared.html` page renders the snapshot, `noindex`, with all user data escaped

### Export

- Full ownership export as **JSON** or **CSV** (RFC 4180)
- Includes products, warranty periods, service history, and document metadata
- Strictly scoped to the authenticated user — never returns another account's data

---

## Security

WarrantyVault's security posture is defense-in-depth for a demo-scale application. Claims below describe mechanisms that actually exist — nothing more.

- **Authentication** — stateless JWT access tokens (default 7-day expiry); client-side logout removes the token locally
- **Password hashing** — bcrypt (bcryptjs)
- **Validation** — Joi schemas on every write endpoint; unknown fields stripped
- **Rate limiting** — per-endpoint limits on auth, uploads, OCR retries, and the Places proxy (per-IP for guests, per-user where authenticated)
- **Google Places proxy protection** — inputs validated (coordinates, radius, keyword, place IDs, photo refs), allow-listed place types, no raw upstream errors or API keys leaked, controlled 503 when unconfigured
- **Upload hardening** — 5 MB cap plus **magic-byte signature validation** (JPEG/PNG/WebP/PDF); declared MIME mismatches are rejected
- **Authorization** — cross-user access denied on every resource (products, documents, service history, notifications, shares); document view/download streams server-side with ownership checks
- **Data integrity** — partial unique index on `{ userId, serialNumber }` for active products (graceful duplicate-key handling)
- **Security headers** — Helmet with a Content-Security-Policy
- **CORS** — production fails fast if `CLIENT_URL` is a wildcard with credentials enabled
- **Request tracing** — `X-Request-ID` on every response, log line, and error
- **Safe error mapping** — classified error taxonomy (`validation` / `authentication` / `authorization` / `external` / …); no stack traces or internal details in production responses
- **Log hygiene** — no JWTs, passwords, Cloudinary/Google secrets, authorization headers, or document contents logged
- **OCR abuse protection** — per-user OCR/upload rate limits and an in-process concurrency cap
- **Observability** — `/health` (liveness) and `/ready` (MongoDB readiness), structured JSON request logs, graceful shutdown on SIGTERM/SIGINT

> Not claimed: zero vulnerabilities, "military-grade" security, formal compliance (GDPR/SOC 2), or penetration testing. This is a hardening baseline for a real product, not a certification.

---

## Privacy & Data Architecture

Data flows are intentionally simple and transparent:

```text
Browser
   │  HTTPS
   ▼
Express API (auth, validation, business logic, OCR, notifications)
   │
   ├──► MongoDB Atlas     — all structured data (users, products, documents,
   │                        service history, notifications, shares)
   └──► Cloudinary        — binary files (images & PDFs), referenced from
                            MongoDB by URL + public_id
```

- **Documents and files** are stored in Cloudinary; MongoDB holds metadata (name, type, size, state, OCR results) and the Cloudinary reference.
- **OCR text** is stored on the document record so you can review, copy, and re-confirm extractions.
- **Share snapshots** expose metadata only — never the underlying files.
- Passwords are stored only as bcrypt hashes. Secrets live in environment variables (Render dashboard / local `.env`), never in git.
- If Cloudinary is unavailable, uploads fail cleanly and OCR retries against stored metadata; if MongoDB is unavailable, `/ready` reports it and the process stays alive.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Web Frontend | HTML/CSS/JS (served statically by the Express API — no build step) |
| Backend | Node.js 20+ / Express |
| Database | MongoDB Atlas (Mongoose ODM) |
| File Storage | Cloudinary |
| OCR | tesseract.js + mupdf (PDF text layer / rasterization) |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Validation | Joi |
| Scheduling | node-cron (expiry + maintenance notifications) |
| Security | Helmet, express-rate-limit, CORS |
| Testing | Jest + Supertest (18 suites) |
| Deployment | Render (blueprint: `render.yaml`) |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |

For the original stack design and rationale, see [docs/tech-stack.md](docs/tech-stack.md).

---

## Repository Structure

```
warranty-checker/
├── README.md
├── LICENSE
├── render.yaml                     # Render blueprint (free tier)
├── .github/workflows/ci.yml
├── assets/                         # project images/icons/fonts (screenshots TBD)
├── docs/                           # architecture, API design, production ops, phase baselines
└── API/
    ├── backend/
    │   ├── src/
    │   │   ├── config/             # env, database, cloudinary
    │   │   ├── controllers/        # request handlers
    │   │   ├── middleware/         # auth, validate, upload, fileSignature, errorHandler, requestId
    │   │   ├── models/             # User, Product, Document, ServiceHistory, Notification, Share
    │   │   ├── routes/             # /api/v1/* route definitions
    │   │   ├── services/           # auth, product, document, ocr, warranty, intelligence,
    │   │   │                       # notification, export, share, dashboard, places…
    │   │   ├── utils/              # AppError, response, jwtHelper, logger, pagination
    │   │   └── validators/         # Joi schemas
    │   ├── public/                 # the web frontend (index.html, css/, js/) +
    │   │                           # shared.html, docs.html
    │   ├── docs/                   # openapi.yaml
    │   ├── scripts/                # demo/test/e2e/smoke utilities
    │   └── tests/                  # 18 Jest suites
    └── docs/                       # Postman collection, API reference
```

---

## Getting Started

**Prerequisites:** Node.js 20+, and (for full features) MongoDB Atlas and Cloudinary accounts. Google Places API key is optional (see below).

### Quick demo (in-memory database)

```bash
cd API/backend
npm install
cp .env.example .env    # fill in Cloudinary creds (uploads/OCR); Mongo not needed
npm run demo            # in-memory MongoDB + real Cloudinary, no DB setup
# open http://localhost:5000
```

`npm run demo` spins up an in-memory MongoDB (`mongodb-memory-server`), so you can try the full app without configuring Atlas. Without Cloudinary credentials, uploads are disabled but everything else works.

### Full local setup

```bash
cd API/backend
npm install
cp .env.example .env    # then fill in real values (see below)
npm run dev             # nodemon on :5000
```

**Environment variables** (all documented in `.env.example` and [docs/PRODUCTION.md](docs/PRODUCTION.md)):

| Variable | Required | Notes |
|---|---|---|
| `MONGO_URI` | yes | Atlas connection string |
| `JWT_SECRET` | yes | long random secret (≥32 chars) |
| `JWT_EXPIRES_IN` | yes | duration format only: `15m`, `7d` |
| `CLOUDINARY_CLOUD_NAME` / `API_KEY` / `API_SECRET` | yes | uploads + OCR |
| `CLIENT_URL` | yes | your origin; `*` fails boot in production |
| `GOOGLE_PLACES_API_KEY` | no | repair-centre search; without it Places returns a controlled 503 and Nominatim geocoding still works |
| `AUTH_RATE_LIMIT` / `UPLOAD_RATE_LIMIT` / `OCR_RATE_LIMIT` / `PLACES_RATE_LIMIT` | no | rate-limit tuning |
| `OCR_MAX_CONCURRENT` | no | max parallel OCR jobs (default 2) |

### Deploy (Render)

`render.yaml` (repo root) is a Render Blueprint for the free tier: single web service, `npm install` / `node src/server.js`, health check on `/health`. Create it via **Dashboard → New → Blueprint**, then set the `sync: false` secrets (Mongo/Cloudinary/JWT/CLIENT_URL) in the Render dashboard. See [docs/PRODUCTION.md](docs/PRODUCTION.md) for the full ops guide.

---

## API Overview

All endpoints are under `/api/v1`.

| Resource | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PUT /auth/preferences` |
| Products | `GET`/`POST /products` · `GET`/`PUT`/`DELETE /products/:id` · `GET /products/search` · `GET /products/expiring-soon` · `GET /products/:id/intelligence` · `GET /products/:id/claim` |
| Documents | `GET`/`POST /documents` · `GET`/`PATCH`/`DELETE /documents/:id` · `GET /documents/:id/view` · `POST /documents/:id/ocr` · `POST /documents/:id/confirm-product` (also mounted under `/products/:productId/documents`) |
| Service History | `GET`/`POST /products/:id/service-history` · `GET`/`PUT`/`DELETE /products/:id/service-history/:recordId` |
| Notifications | `GET /notifications` · `PUT /notifications/:id/read` · `PUT /notifications/read-all` · `DELETE /notifications/:id` |
| Shares | `GET`/`POST /products/:id/shares` · `DELETE /products/:id/shares/:shareId` · public `GET /shared/:token` |
| Dashboard | `GET /dashboard` |
| Export | `GET /export/products?format=json\|csv` |
| Places | `GET /places/nearby` · `GET /places/geocode` · `GET /places/details` · `GET /places/photo` |
| Docs | `GET /api/docs` (rendered reference) · `GET /api/docs/openapi.yaml` (OpenAPI 3.0.3) |
| Health | `GET /health` (liveness) · `GET /ready` (MongoDB readiness) |

A machine-readable **OpenAPI 3.0.3** spec lives at [`API/backend/docs/openapi.yaml`](API/backend/docs/openapi.yaml), served live at `/api/docs/openapi.yaml` with a rendered quick-reference at `/api/docs`. Detailed design docs: [docs/api-design.md](docs/api-design.md), [docs/database-design.md](docs/database-design.md).

---

## Testing

```bash
cd API/backend
npm test              # full Jest suite (18 suites)
npm run ocr:sim       # OCR parser simulation over many document shapes
npm run smoke         # live API smoke test (needs a running server + env)
```

CI (GitHub Actions) runs tests, the OCR simulation, syntax checks, and an OpenAPI spec drift guard on every push/PR. The repository currently passes **18 suites / 273 tests**, and SonarCloud reports **A ratings for Reliability, Security, and Security Review** with a passing quality gate.

---

## Roadmap

**Phase 1 — Product/UI completion** — DONE
**Phase 2 — Security & engineering hardening** — DONE
**Phase 3 — Production readiness** — DONE
**Phase 4 — Advanced product features** — COMPLETE (9 tranches shipped)

Phase 4 shipped: data model foundation (providers, lifecycle, coverage periods) · centralized warranty-status engine · deterministic warranty intelligence · custom reminder schedules + maintenance reminders · advanced filtering + tags · claim preparation + CSV/JSON export · document verification & organization · secure product sharing · notification center polish.

The one Phase 4 item deliberately **not** implemented is family/shared ownership (§18) — per-product sharing already covers technician/family read access without an authentication-model rewrite. See [docs/PHASE4-BASELINE.md](docs/PHASE4-BASELINE.md) for the full tranche breakdown.

---

## Documentation

| Doc | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | System architecture |
| [docs/database-design.md](docs/database-design.md) | Data model |
| [docs/api-design.md](docs/api-design.md) | API design |
| [docs/PRODUCTION.md](docs/PRODUCTION.md) | Production ops, env checklist, backups, recovery |
| [docs/PHASE3-BASELINE.md](docs/PHASE3-BASELINE.md) | Phase 3 gap checklist |
| [docs/PHASE4-BASELINE.md](docs/PHASE4-BASELINE.md) | Phase 4 tranche breakdown |
| [API/backend/docs/openapi.yaml](API/backend/docs/openapi.yaml) | OpenAPI 3.0.3 spec |

---

## License

MIT — see [LICENSE](LICENSE).

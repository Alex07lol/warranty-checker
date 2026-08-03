# WarrantyVault — Handoff Instructions

**Last updated:** August 3, 2026 — End of Day 2

---

## What Has Been Built

### Day 1 — Architecture and Documentation
All architecture, API, database, and technology decisions are fully documented under `docs/`.

Key documents:
- `docs/api-design.md` — Complete REST API contract for every endpoint
- `docs/database-design.md` — MongoDB collection schemas with indexes
- `docs/architecture.md` — System architecture overview
- `docs/tech-stack.md` — Technology justifications and coding standards
- `docs/day2-plan.md` — Original Day 2 implementation roadmap

### Day 2 — Backend, Flutter, and Web UI (Completed)

#### Backend — Node.js / Express (`backend/`)
Fully implemented and committed to the repository. Includes:

- **Config** — `src/config/env.js`, `database.js`, `cloudinary.js`
- **Models** — `User`, `Product`, `Document`, `ServiceHistory`, `Notification` (Mongoose schemas with indexes)
- **Services** — Full business logic for auth, products, documents, service history, notifications, dashboard
- **Controllers** — REST controllers for all 6 resource types
- **Routes** — All routes wired under `/api/v1`
- **Middleware** — JWT auth (`auth.js`), error handler, 404 handler, Multer file upload, Joi validation
- **Validators** — Joi schemas for auth, product, document, service history
- **Utils** — `AppError`, JWT helper (`jwtHelper.js`), API response helpers (`response.js`)
- **Scripts** — `scripts/check-cloudinary.js` to verify Cloudinary credentials
- **Tests** — `tests/health.test.js` (Jest + Supertest)
- **Security** — Helmet, rate limiting on auth routes, bcrypt (cost 12), JWT (7d expiry)
- **Cron** — Daily job at midnight creates expiry notifications for warranties ≤ 30 days

The server starts even without a database connection (offline/demo mode) and serves the web UI.

#### Flutter App — Dart / Provider (`mobile/warranty_vault/`)
Fully scaffolded and committed. Includes:

- All screens: splash, welcome, login, register, dashboard, product list, product detail, add product, edit product, document upload, notifications, settings
- Provider-based state management
- Dio HTTP client with JWT interceptor
- `pubspec.yaml` with all dependencies
- Android permissions file (`android_manifest_permissions.txt`)

#### Web UI Mockup (`backend/public/index.html`)
A phone-form-factor web UI served by Express on port 5000. Updated in Day 2 session.

Current features:
- **Login / Register screen** — Sign In and Register tabs with form validation; falls back to demo mode if no DB is connected; "Guest (Demo Mode)" button for instant access; auto-skips login if JWT token exists in localStorage
- **Home view** — Products needing attention (expired/expiring warranties) + recent products
- **Product cards** — Real images from Unsplash by brand and category; custom photo upload per product
- **Product detail overlay** — Warranty status block, full specifications, document chips
- **Quick Actions in product detail** — "Find Repair Center" and "Scan / OCR" buttons that close the overlay and navigate to the correct tab
- **Scan (OCR) tab** — Placeholder camera shutter for future receipt scanning
- **Repair / Service tab** — Placeholder map grid for future nearest service center feature
- **Glassmorphism pill bottom nav** — Shared `switchView()` function used by both nav buttons and quick action buttons
- **State** — persisted in browser localStorage; greeting name updates on login

---

## Current Server Status

- **Server:** Running on `http://localhost:5000` via `npm run dev` in `backend/`
- **Database:** Not connected (placeholder URI in `.env`) — running in offline/demo mode
- **Web UI:** Accessible at `http://localhost:5000`
- **API health:** `http://localhost:5000/health`

---

## What Needs to Be Done Next

### Priority 1 — Connect MongoDB Atlas (15 minutes)
The backend code is complete. Only the `.env` credentials are missing.

Steps:
1. Go to [https://cloud.mongodb.com](https://cloud.mongodb.com) → create a free M0 cluster
2. Create a DB user and whitelist your IP (or `0.0.0.0/0` for dev)
3. Click **Connect → Drivers** → copy the connection string
4. Edit `backend/.env`:
   ```
   MONGO_URI=mongodb+srv://youruser:yourpass@cluster0.xxxxx.mongodb.net/warrantyvault_db
   JWT_SECRET=<at-least-32-random-characters>
   ```
5. Restart the server — login, register, and all API endpoints will work

To verify Cloudinary without running the full app:
```bash
npm run check:cloudinary
```

### Priority 2 — Connect Web UI to Real API
The web mockup currently reads/writes localStorage. To hook it up to the live backend:
- The login form already calls `POST /api/v1/auth/login` and falls back to demo mode on failure — once the DB is live, it will work automatically
- Replace localStorage product reads with `GET /api/v1/products` (with `Authorization: Bearer <token>` header)
- Replace localStorage product writes with `POST/PUT/DELETE /api/v1/products`
- Replace Unsplash image URLs with `thumbnailUrl` returned by the API

### Priority 3 — Flutter Project Setup
The Flutter source is committed at `mobile/warranty_vault/`.

Steps:
1. Install Flutter SDK: https://docs.flutter.dev/get-started/install
2. Inside `mobile/warranty_vault/`, run:
   ```bash
   flutter pub get
   ```
3. Open `mobile/warranty_vault/android/app/src/main/AndroidManifest.xml` and add inside `<manifest>`:
   ```xml
   <uses-permission android:name="android.permission.INTERNET"/>
   <uses-permission android:name="android.permission.CAMERA"/>
   <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"/>
   <uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>
   ```
4. Update `lib/core/constants/api_constants.dart`:
   - Android emulator: `http://10.0.2.2:5000/api/v1`
   - Physical device: use your machine's LAN IP
5. Run `flutter run` with an emulator or device connected

### Priority 4 — OCR Camera Feature (Scan Tab)
The Camera tab has the placeholder shell ready in the web UI and Flutter.

Plan:
- Flutter: use `camera` + `google_ml_kit` packages for on-device OCR
- Parse OCR output to extract product name, brand, purchase date, serial number, warranty period
- Pre-fill the Add Product form with extracted values
- Web: use browser `MediaDevices` API + `Tesseract.js` for in-browser OCR
- No backend changes required

### Priority 5 — Repair and Service Center Map (Repair Tab)
The Repair tab placeholder is ready in both the web UI and Flutter.

Plan:
- Use `google_maps_flutter` plugin (Flutter) or Google Maps JS API (web)
- On tab open: request location permission → get GPS coordinates
- Call Google Places API: `authorized service center for [product brand]` filtered by proximity
- Display pins with tap-to-call and directions
- Optionally cache results in MongoDB to reduce API costs

### Priority 6 — Product Image Auto-Pull
Currently using Unsplash as a free placeholder.

Plan:
- Integrate Google Custom Search JSON API (image search)
- Query: `[brand] [model] [category] product`
- Cache returned URL in `Product.thumbnailUrl` in MongoDB
- Custom uploaded photo always overrides the auto-pulled URL

---

## MongoDB — What Is Stored

| Collection | What |
|---|---|
| `users` | name, email, hashed password, notification preferences |
| `products` | name, brand, model, category, purchase date/price/store, serial number, warranty expiry, soft-delete flag, thumbnail URL |
| `documents` | Cloudinary file URL + public_id, document type (receipt/warranty_card/photo/manual/other), file metadata — linked to a product |
| `servicehistories` | repair/maintenance events with date, provider, cost, description, next service date — linked to a product |
| `notifications` | auto-generated expiry alerts (title, message, read/unread state, sent state) — created by daily cron |

> **Actual files (images/PDFs) are not stored in MongoDB.** Only their Cloudinary URLs are. Binary data lives on Cloudinary CDN.

---

## Git Commit History (Day 2)

All commits follow Conventional Commits format. Day 2 commits in order:

```
feat(models)       — Mongoose schemas for all 5 collections
feat(config)       — env loader, DB connection, Cloudinary config
feat(utils)        — AppError, JWT helper, response helpers
feat(middleware)   — JWT auth, error handler, upload, validation
feat(services)     — business logic for all 6 resources
feat(controllers)  — REST controllers for all 6 resources
feat(routes)       — all API routes under /api/v1
feat(validators)   — Joi input validators
feat(backend)      — scripts, tests, package deps
feat(ui)           — login screen, product quick actions, shared nav
feat(mobile)       — Flutter project scaffold
docs               — updated handoff, commit plan, package readme
```

---

## Technical Guidelines

### API Contract
Every endpoint returns:
```json
{ "success": true,  "message": "string", "data": {} }
{ "success": false, "message": "string", "errors": [] }
```
Never break this contract — Flutter and the web client both depend on it.

### Coding Standards
- JavaScript: camelCase variables/functions, PascalCase classes, UPPER_SNAKE_CASE constants, kebab-case file names
- Dart: PascalCase widgets/classes, camelCase variables/methods, snake_case file names
- No emojis in code or comments
- No dead code committed
- All secrets in `.env`, never committed
- Commit messages: Conventional Commits — `type(scope): description`

### Git Workflow
- Branch from `main` for all new features: `feature/feature-name`
- Keep commits atomic and focused on one logical change
- Never force-push `main`

### Dependency Notes
- `multer-storage-cloudinary` is intentionally NOT used — it has peer dependency conflicts with Cloudinary SDK 2.x. Files are streamed to Cloudinary manually via `upload_stream`.
- Run `npm install` inside `backend/` before starting

### Database Rules
- Never hard-delete product records — use `isDeleted: true` soft-delete flag
- Warranty expiry notifications must be deduplicated per product per interval (30d, 7d, 1d)
- Validate all ObjectId references in the service layer before any DB operation

### Environment Requirements
- Node.js 20+
- Flutter SDK 3.x+
- MongoDB Atlas M0 free tier (sufficient for development)
- Cloudinary free tier (sufficient for development)

# WarrantyVault API Reference & Usage Guide

Companion usage guide for the WarrantyVault API — from curl or from Postman —
verified against the actual backend routes in `backend/src/routes`.

> **Machine-readable spec:** the OpenAPI 3.0.3 document is the canonical
> contract — `API/backend/docs/openapi.yaml`, served live at
> `GET /api/docs/openapi.yaml`. A rendered quick-reference page is available
> at `GET /api/docs`.

- Base URL (API): `http://localhost:5000/api/v1`
- Base URL (health): `http://localhost:5000/health`
- Every endpoint except `/health`, `/ready`, `/api/docs`, `/api/docs/openapi.yaml`,
  `POST /auth/register` and `POST /auth/login` requires
  `Authorization: Bearer <token>`.
- Every response carries an `X-Request-ID` header — include it when reporting
  an error (it matches `error.requestId` on failure payloads).

---

## 1. Response envelope

All endpoints return a consistent envelope:

```jsonc
{
  "success": true,          // or false
  "message": "Products retrieved",
  "data": { /* feature payload — can be null */ },
  "errors": []              // validation details; only present on error
}
```

Error status codes used: `400` bad request / validation, `401` invalid or
missing token, `403` resource belongs to another user, `404` not found,
`409` duplicate (registration), `422` business-rule violation (e.g. expiry
date before purchase date), `429` rate limited (auth), `500` server error.

---

## 2. Quick start with curl

```bash
# 1. Health
curl http://localhost:5000/health

# 2. Register (returns a JWT)
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Demo User","email":"demo@example.com","password":"password123","confirmPassword":"password123"}'

# 3. Login
TOKEN=$(curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"password123"}' | \
  node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data.token))")

# 4. Create a product
curl -X POST http://localhost:5000/api/v1/products \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"productName":"Sony WH-1000XM5","brand":"Sony","warrantyExpiryDate":"2027-06-01"}'

# 5. Dashboard
curl http://localhost:5000/api/v1/dashboard -H "Authorization: Bearer $TOKEN"
```

> **Rate limit:** `POST /auth/register` and `POST /auth/login` share a limiter
> (default 10 requests per 15 minutes per IP, `AUTH_RATE_LIMIT` env var). Use
> the same account for repeated testing instead of re-registering.

---

## 3. Endpoint map ↔ Flutter `ApiConstants`

| Feature | Method & path | `ApiConstants` (mobile) |
|---|---|---|
| Health | `GET /health` | — |
| Auth | `POST /auth/register` | `authRegister` |
| Auth | `POST /auth/login` | `authLogin` |
| Auth | `POST /auth/logout` | `authLogout` |
| Auth | `GET /auth/me` | `authMe` |
| Auth | `PUT /auth/change-password` | `authChangePassword` |
| Products | `GET /products` | `products` |
| Products | `GET /products/search?q=` | `productSearch` |
| Products | `GET /products/expiring-soon` | `productExpiring` |
| Products | `GET /products/:id` | `products` + id |
| Products | `POST /products` | `products` |
| Products | `PUT /products/:id` | `products` + id |
| Products | `DELETE /products/:id` (soft) | `products` + id |
| Dashboard | `GET /dashboard` | `dashboard` |
| Documents | `GET /products/:productId/documents` | `documents` |
| Documents | `POST /products/:productId/documents` (multipart) | `documents` |
| Documents | `GET /products/:productId/documents/:documentId` | `documents` |
| Documents | `GET /documents/:documentId/view` (streams bytes) | `documents` + id |
| Documents | `DELETE /products/:productId/documents/:documentId` | `documents` |
| Service history | `GET /products/:productId/service-history` | `serviceHistory` |
| Service history | `POST /products/:productId/service-history` | `serviceHistory` |
| Service history | `GET /products/:productId/service-history/:recordId` | `serviceHistory` |
| Service history | `PUT /products/:productId/service-history/:recordId` | `serviceHistory` |
| Service history | `DELETE /products/:productId/service-history/:recordId` | `serviceHistory` |
| Notifications | `GET /notifications?unreadOnly=true` | `notifications` |
| Notifications | `PUT /notifications/read-all` | `notificationsReadAll` |
| Notifications | `PUT /notifications/:id/read` | `notifications` + id |
| Notifications | `DELETE /notifications/:id` | `notifications` + id |

---

## 4. Endpoints in detail

### 4.1 Auth

**POST `/auth/register`** — create an account.

```json
{ "name": "Demo User", "email": "demo@example.com",
  "password": "password123", "confirmPassword": "password123" }
```

- `name`: 2–100 chars, required. `email`: valid email, required (case-insensitive, duplicates → 409).
- `password`: min 8 chars, required. `confirmPassword` must equal `password`.
- Returns `201` with `data: { user: { _id, name, email, createdAt }, token }`.

**POST `/auth/login`** — authenticate.

```json
{ "email": "demo@example.com", "password": "password123" }
```

Returns `200` with the same `{ user, token }` shape. Wrong credentials → `401`.

**GET `/auth/me`** — current profile (`user` without `passwordHash`).

**PUT `/auth/change-password`**

```json
{ "currentPassword": "password123", "newPassword": "newpassword123",
  "confirmNewPassword": "newpassword123" }
```

`newPassword` min 8 chars; wrong current password → `400`.

**POST `/auth/logout`** — stateless; returns `200` with `data: null`.

### 4.2 Products

**GET `/products`** — paginated list.

Query: `page` (default 1), `limit` (default 20, max 100), `sortBy`
(`createdAt` | `updatedAt` | `productName` | `warrantyExpiryDate`),
`order` (`asc` | `desc`).

Returns `data: { products: [...], total, page, limit }`. Deleted products are
excluded.

**POST `/products`** — create. Only `productName` is required; everything else
optional:

```json
{ "productName": "Sony WH-1000XM5", "brand": "Sony", "model": "WH-1000XM5",
  "category": "Electronics", "purchaseDate": "2025-06-01", "purchasePrice": 349.99,
  "currency": "USD", "purchaseStore": "Best Buy", "serialNumber": "SN-1",
  "warrantyExpiryDate": "2027-06-01", "warrantyPeriodMonths": 24,
  "notes": "…", "thumbnailUrl": "https://…" }
```

`warrantyExpiryDate` must be after `purchaseDate` → else `422`. Returns `201`.

**GET `/products/:id`** — single product. Not yours → `403`, missing → `404`.

**PUT `/products/:id`** — partial update (at least one field).

**DELETE `/products/:id`** — soft delete (sets `isDeleted: true`).

**GET `/products/search?q=headphones`** — full-text search over
`productName`, `brand`, `model`. Requires the MongoDB text index defined in
`backend/src/models/Product.js` (auto-created by Mongoose in development).

**GET `/products/expiring-soon`** — products whose warranty expires within the
next 30 days, sorted by expiry date.

### 4.3 Documents (multipart)

All document endpoints are nested under a product:
`/products/:productId/documents`.

**POST `/products/:productId/documents`** — `multipart/form-data`:

| Field | Type | Notes |
|---|---|---|
| `file` | file | `image/jpeg`, `image/png`, `image/webp`, `application/pdf`; max 10 MB |
| `documentType` | string | `receipt`, `warranty_card`, `product_photo`, `manual`, `other` (required) |
| `notes` | string | optional, max 2000 chars |

Files are uploaded to **Cloudinary** (`multer-storage-cloudinary`) under
`warrantyvault/{userId}/{productId}/{documentType}/`. A `product_photo` also
sets the product's `thumbnailUrl`. Returns `201` with the Document document
(`fileUrl`, `publicId`, `fileSize`, `mimeType`, …).

> **Edit-and-confirm on standalone scans:** when a `receipt` or `warranty_card`
> is uploaded through `/documents` (no product attached), OCR **stages** the
> extracted data on the document (`parsedData`, including a best-effort
> `productName` suggestion plus `brand` and `model`) but does **not** create a
> product. The brand and model are split out of the suggested name — e.g.
> "Samsung Fridge" becomes name "Fridge", brand "Samsung" (a known-brand
> list + `Brand:`/`Model No:` labels drive the extraction). The client shows a
> review form pre-filled with the extracted values; the user corrects any OCR
> mistakes and confirms via
> `POST /documents/:documentId/confirm-product` (below), which creates the
> product with the user-confirmed values and links the document to it
> (reusing an existing product with the same serial number instead of
> duplicating). The document's `productId` stays `null` until the user
> confirms — nothing is saved without their review.

**GET `/products/:productId/documents`** — returns
`data: { documents: [...] }` sorted by upload time descending.

**GET `/products/:productId/documents/:documentId`** and
**DELETE `/products/:productId/documents/:documentId`** — fetch/delete a single
document. Delete also removes the file from Cloudinary.

**GET `/documents/:documentId/view`** (also available as
`GET /products/:productId/documents/:documentId/view`) — **streams the
original file bytes** (not JSON). The server fetches the file from Cloudinary's
Admin API with API-key auth, so viewing works even when the account's media
-delivery ACL blocks direct `fileUrl` access (e.g. PDFs). Returns the file with
`Content-Type` matching the stored mime type, an `inline` `Content-Disposition`
and `Cache-Control: private, no-store`. Auth required; another user's document
→ `403`, missing → `404`, Cloudinary download failure → `502`.

**POST `/documents/:documentId/confirm-product`** — end of the edit-and-confirm
flow for standalone scans. Creates a product from the user-reviewed OCR data
and links the document to it. Body (all optional except `productName`):

```json
{ "productName": "QLED TV", "brand": "Samsung", "model": "QN65S90",
  "serialNumber": "CONFIME2E-5566", "purchasePrice": 749.99,
  "purchaseStore": "ACME STORE", "purchaseDate": "2026-04-10",
  "warrantyExpiryDate": "2028-12-31" }
```

- If another product already carries the same `serialNumber`, the document is
  linked to that existing product instead of creating a duplicate.
- Requires the document's background OCR to have finished (`ocrStatus: "done"`)
  — this is the review step of a completed scan.
- Returns `201` with `data: { product, document }`. An empty form field simply
  leaves the field unset on the product.
- `409` if the document is already linked to a product; `422` on validation
  errors (missing name, non-numeric price, OCR not finished, expiry on/before
  the purchase date); `403` for another user's document; `404` if it doesn't
  exist.

### 4.4 Service history

Nested under a product: `/products/:productId/service-history`.

**POST `/products/:productId/service-history`** — add a record:

```json
{ "serviceDate": "2026-06-15", "serviceType": "maintenance",
  "serviceProvider": "Sony Service Center", "cost": 49.99, "currency": "USD",
  "description": "Annual checkup", "documentIds": ["…24-hex-char ObjectId…"],
  "nextServiceDate": "2027-06-15" }
```

- `serviceDate`: ISO date, required. `serviceType`: `repair` | `maintenance` |
  `inspection` | `replacement` | `other`, required.
- `cost` ≥ 0; `documentIds` are 24-hex ObjectIds. Returns `201`.

**GET `/products/:productId/service-history`** — all records, newest service
date first.

**GET/PUT/DELETE `/products/:productId/service-history/:recordId`** — single
record operations; `PUT` accepts any subset of the create fields.

### 4.5 Notifications

**GET `/notifications?unreadOnly=true`** — list; `unreadOnly` filters to
unread. `data` is an array with `productId` populated
(`productName`, `warrantyExpiryDate`).

**PUT `/notifications/read-all`** — mark every notification read
(`data: null`).

**PUT `/notifications/:id/read`** — mark one read; returns the updated
notification. Missing → `404`, malformed id → `400`.

**DELETE `/notifications/:id`** — remove one.

> Notifications are generated by the expiry job
> (`createExpiryNotifications` in `notification.service.js`) for products whose
> warranty expires on the configured reminder days (`30 / 7 / 1` by default).
> A fresh account will typically have an empty list — that is expected.

### 4.6 Dashboard

**GET `/dashboard`** — one-shot stats for the home screen:

```jsonc
{
  "totalProducts": 3,            // number
  "expiringSoonCount": 1,        // number
  "totalDocuments": 2,           // number
  "unreadNotificationsCount": 0, // number
  "recentProducts": [ /* up to 5 newest */ ],
  "expiringSoon": [ /* all products expiring within 30 days, soonest first (no cap) */ ]
}
```

---

## 5. Using the API from Flutter

The app already contains the full client (`ApiService` with Dio, an
interceptor that attaches `Bearer` tokens, plus per-feature services,
providers and models). If you are re-implementing an endpoint:

```dart
// lib/shared/services/api_service.dart — GET example
final response = await apiService.get(
  '${ApiConstants.documents.replaceAll('{productId}', productId)}',
);
// Envelope: response.data['data']
```

Guidelines:

- Base URL is compile-time configurable:
  `flutter run --dart-define=API_BASE_URL=http://10.0.2.2:5000/api/v1`
  (default is `http://10.0.2.2:5000/api/v1` — see `api_constants.dart`).
- `documentType` and `serviceType` enum values in the app must match the
  backend enums exactly (see 4.3 / 4.4).
- The Dio interceptor clears the stored token on any `401`, matching the
  backend's stateless JWT auth.

---

## 6. Verifying the whole program

### Option A — Postman

Import `docs/warrantyvault.postman_collection.json`. Collection variables
(`baseUrl`, `token`, `productId`, `documentId`, `recordId`,
`notificationId`) are captured automatically by the Register / Login / Create
product / Upload / Add service record scripts. Run requests in the order shown
in the collection description.

### Option B — automated smoke client (recommended for handoff)

The backend ships a dependency-free end-to-end client that drives the API the
same way the app does:

```bash
cd backend
npm install
cp .env.example .env   # set real MONGO_URI, JWT_SECRET, Cloudinary values
npm run dev            # terminal 1 — start the API
npm run smoke          # terminal 2 — run the full flow
```

What it exercises: health → register → login → me → 401 guard → product
create/list/search/expiring/get/update → service-history
create/list/update/delete → document upload/list/get/delete (Cloudinary) →
dashboard → notifications → read-all → change password → re-login → logout →
soft delete.

Exit code is `0` when everything passes and `1` otherwise, so it can gate CI.
If Cloudinary is not configured, the document-upload step is reported as a
`WARN` and the rest of the flow still runs. Customize with environment
variables: `BASE_URL`, `EMAIL`, `PASSWORD`, `NEW_PASSWORD`.

---

## 7. Environment variables (backend)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | HTTP port |
| `NODE_ENV` | — (set in `.env`) | `test` disables DB connect in `server.js` and applies built-in defaults |
| `MONGO_URI` | — | MongoDB connection string (Atlas or local) |
| `JWT_SECRET` | — | Signing secret for JWTs |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | — | Cloudinary uploads |
| `CLIENT_URL` | `*` | CORS origin(s) |
| `AUTH_RATE_LIMIT` | `10` | Register/login rate limit per 15 min |

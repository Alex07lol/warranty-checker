This is the complete walkthrough of the "WarrantyVault" API — how it's architected, how every endpoint works, and how the Flutter app consumes it. Everything below is verified against the actual code in `backend/src`.

---------------------------------------------------------

1. The big picture

The API is a **REST JSON API** built on **Node.js + Express 4 + MongoDB (Mongoose)**, protected by **JWT bearer tokens**, with **Joi** validation, **Helmet** security headers, and **rate limiting** on auth routes.
It's the backend half of WarrantyVault : a warranty tracking app where users register products, upload receipts, log service visits, and get expiry notifications.

---------------------------------------------------------

2. How the backend is organized (request lifecycle)

A request flows through this chain, which is why the code is structured into layers:

```
Express app (server.js)
  → route definitions (routes/*.js)
  → middleware: auth (JWT check), validate (Joi), upload (multer)
  → controllers (thin — parse req, call service, send response)
  → services (business logic + MongoDB queries)
  → models (Mongoose schemas)
```

- **Routes** : only wire paths to middleware + controllers. E.g. `product.routes.js` mounts `router.use(auth)` so every `/products` endpoint requires a token.
- **Controllers** : are intentionally thin — they pull values off `req.body` / `req.params` / `req.user` and delegate.
- **Services** : contain the real logic: ownership checks, date validations, DB queries.
- **Models** : define the MongoDB collections: `User`, `Product`, `Document`, `ServiceHistory`, `Notification`.

---------------------------------------------------------

3. Authentication — the JWT flow

The whole app hinges on this, so it's worth understanding deeply.

### How a token is issued
`auth.service.js` registers or logs in a user and returns:

```jsonc
{
  "data": {
    "user": { "_id": "...", "name": "Demo", "email": "demo@example.com", "createdAt": "..." },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
  }
}
```

The token is a **JWT signed with the server's `JWT_SECRET`**, containing just the user ID, expiring after `JWT_EXPIRES_IN` (default 7 days):

```js
// utils/jwtHelper.js
jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
```

### How it's verified
The `auth` middleware (`middleware/auth.js`) runs on every protected route:

1. Reads the `Authorization: Bearer <token>` header.
2. Verifies the JWT signature + expiry.
3. If valid, attaches `req.user = { userId }` so downstream code knows *who* is calling.
4. If missing/invalid → `401 Unauthorized`.

```js
if (!header || !header.startsWith("Bearer ")) return next(new AppError("Unauthorized", 401));
const decoded = verifyToken(token);   // throws → 401
req.user = decoded;
```

Because it's stateless JWT auth, the server stores no session — `POST /auth/logout` just returns 200 (the client discards the token; that's exactly what the Flutter `StorageService` does).

### Auth endpoints

| Method | Path | Body | Notes |
|---|---|---|---|
| `POST` | `/auth/register` | `name`, `email`, `password`, `confirmPassword` | `password` ≥ 8 chars; duplicate email → `409`; returns token |
| `POST` | `/auth/login` | `email`, `password` | Wrong creds → `401` |
| `GET` | `/auth/me` | — | Returns profile (password hash stripped) |
| `PUT` | `/auth/change-password` | `currentPassword`, `newPassword`, `confirmNewPassword` | Wrong current → `400` |
| `POST` | `/auth/logout` | — | Stateless; just ack |

**Rate limiting:** register + login share an `express-rate-limit` limiter — 10 requests / 15 min per IP by default (`AUTH_RATE_LIMIT` env). That's why repeated test registrations can suddenly get `429`.

---------------------------------------------------------

4. The feature APIs

# Products — the core resource

All product routes require auth. The interesting bits:

**`GET /products`** — paginated list, sorted, soft-delete aware:

```
/products?page=1&limit=20&sortBy=createdAt&order=desc
```

The service (`product.service.js`) clamps `page` ≥ 1 and `limit` 1–100, whitelists `sortBy` (only `createdAt | updatedAt | productName | warrantyExpiryDate`), and always filters `{ userId, isDeleted: false }` — so deleted products never appear. Returns:

```jsonc
{ "data": { "products": [...], "total": 3, "page": 1, "limit": 20 } }
```

**`POST /products`** — create. Only `productName` is required:

```json
{
  "productName": "Sony WH-1000XM5",
  "brand": "Sony", "model": "WH-1000XM5", "category": "Electronics",
  "purchaseDate": "2025-06-01", "purchasePrice": 349.99, "currency": "USD",
  "purchaseStore": "Best Buy", "serialNumber": "SN-1",
  "warrantyExpiryDate": "2027-06-01", "warrantyPeriodMonths": 24,
  "notes": "...", "thumbnailUrl": "https://..."
}
```

**Business rule:** the service rejects `warrantyExpiryDate` ≤ `purchaseDate` with **`422`** — a custom status the app uses for "valid shape, but violates a rule."

**`GET /products/:id`** — ownership enforced: a product belonging to another user → `403 Forbidden`; not found / soft-deleted → `404`.

**`PUT /products/:id`** — partial update (Joi requires ≥ 1 field). Re-validates the same expiry-before-purchase rule against the merged data.

**`DELETE /products/:id`** — **soft delete**: sets `isDeleted: true` rather than removing the row, so dashboards and history still work.

**`GET /products/search?q=headphones`** — MongoDB **full-text search** over `productName`, `brand`, `model` (backed by the text index defined in the Product model), sorted by relevance score.

**`GET /products/expiring-soon`** — warranties ending within the next 30 days, soonest first — powers the dashboard's alert.

# Documents — multipart uploads to Cloudinary

Nested under a product: `/products/:productId/documents`.

**`POST /products/:productId/documents`** is the one non-JSON endpoint. It's `multipart/form-data` handled by **multer + CloudinaryStorage** (`middleware/upload.js`):

| Field | Type | Notes |
|---|---|---|
| `file` | file | jpeg/png/webp/pdf only; max 10 MB |
| `documentType` | string | `receipt`, `warranty_card`, `product_photo`, `manual`, `other` (required) |
| `notes` | string | optional, ≤ 2000 chars |

The upload pipeline is notable:

1. **multer** streams the file to Cloudinary (`warrantyvault/{userId}/{productId}/{documentType}/`).
2. The stored file object (URL, public_id, bytes, mime) is saved as a `Document` row in MongoDB.
3. A bonus rule: if `documentType === "product_photo"`, the service automatically updates the product's `thumbnailUrl` to the uploaded image (`document.service.js`).

`GET /products/:productId/documents` returns `{ data: { documents: [...] } }`; deleting a document also calls `cloudinary.uploader.destroy()` to remove the file from Cloudinary.

# Service history

Also nested: `/products/:productId/service-history`. It's the maintenance log for a product.

**`POST`** creates a record:

```json
{
  "serviceDate": "2026-06-15",          // ISO, required
  "serviceType": "maintenance",          // repair|maintenance|inspection|replacement|other
  "serviceProvider": "Sony Service Center",
  "cost": 49.99, "currency": "USD",
  "description": "Annual checkup",
  "documentIds": ["64-char-hex ObjectId"],  // optional links to Documents
  "nextServiceDate": "2027-06-15"
}
```

`GET` lists newest-first; `GET/PUT/DELETE /:recordId` handle single records. The service guards every operation with `assertOwner(productId, userId)` — so you can't touch another user's product's history.

# Notifications

`GET /notifications?unreadOnly=true` lists alerts with the product populated (`productName`, `warrantyExpiryDate`). Then:

- `PUT /notifications/read-all` — mark everything read (`data: null`)
- `PUT /notifications/:id/read` — mark one read, returns it
- `DELETE /notifications/:id` — remove one

**Where do notifications come from?** The service has `createExpiryNotifications()` — a job that scans for products whose warranties expire on the reminder days (default 30/7/1 days out) and creates `warranty_expiry` notifications. It's not wired to a route or cron yet, so a fresh account usually has an empty list — the API to *consume* them is complete, but the *generator* isn't scheduled. That's a known Day-2 follow-up.

# Dashboard

`GET /dashboard` runs six MongoDB queries in parallel (`Promise.all`) for the home screen:

```jsonc
{
  "data": {
    "totalProducts": 3,
    "expiringSoonCount": 1,
    "totalDocuments": 2,
    "unreadNotificationsCount": 0,
    "recentProducts": [...],   // up to 5 newest
    "expiringSoon": [...]      // all within 30 days, soonest first
  }
}
```

---------------------------------------------------------

5. How the Flutter app consumes it

The mobile side mirrors the API 1:1:

- **`ApiService`** (Dio) wraps every call and has a **request interceptor** that auto-attaches `Authorization: Bearer <stored token>` to every request, plus an **error interceptor** that wipes the stored token on any `401` — matching the backend's stateless auth.
- **`ApiConstants`** centralizes every path (`authRegister`, `products`, `documents`, ...) — same strings as the routes above.
- Each feature has a **service** (calls `ApiService`), a **provider** (`ChangeNotifier` holding state + loading/error flags), and a **model** (`fromJson` parsing the `data` envelope).
- Base URL is compile-time configurable: `flutter run --dart-define=API_BASE_URL=http://10.0.2.2:5000/api/v1` (the default targets the Android emulator's host alias `10.0.2.2`).

---------------------------------------------------------

6. Error handling & security — the full picture

- **Custom errors:** services throw `AppError(message, statusCode)`, and the central `errorHandler` middleware converts any thrown error (including Joi validation, multer errors, and Mongoose cast errors) into the `{ success: false, message, errors }` envelope.
- **Status codes in use:** `400` validation · `401` auth · `403` ownership · `404` not found · `409` duplicate · `422` business rule · `429` rate limit · `500` server.
- **Hardening:** Helmet (security headers), CORS restricted to `CLIENT_URL` (or `*`), JSON body limit 1 MB, file upload capped at 10 MB with a strict MIME allowlist, and passwords hashed with bcrypt in the User model.
- **404 fallback:** `notFound` middleware catches unmatched routes.

---------------------------------------------------------

## 7. The smoke client as a guided tour

The `backend/scripts/api-smoke.js` I added is literally a run-through of the whole API — it's the best live demonstration of how the pieces fit. It does, in order: `health → register → login → me → 401-guard → create/list/search/expiring/get/update product → add/list/update/delete service record → upload/list/get/delete document → dashboard → notifications → read-all → change-password → re-login → logout → soft-delete`. Run it with `npm run smoke` once the server is up; it exits `0` only if every step passes.

------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 This is using the following stuff:
 ### a standard JWT-secured REST API with layered Express architecture,
 ### full CRUD on products/documents/service-history, 
 ### a multi-query dashboard, 
 ### notification consumption endpoints,
 ### a Flutter client that mirrors every path with the two deliberate gaps being the unscheduled notification generator and unverified live runs (no bash on this machine).

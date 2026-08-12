# Phase 4 — Advanced Product Features: Baseline

Status: **IN PROGRESS** — Tranches 1–8 shipped (data model, status engine, warranty intelligence, reminders & maintenance, filters & tags, claim prep & export, document verification & organization, secure sharing).

## Tranche 1 — Data model foundation (shipped)

Backward-compatible additions to the `Product` schema (old documents and the
legacy `warrantyExpiryDate` / `warrantyPeriodMonths` fields keep working
unchanged; no migration required):

| Field | Type | Notes |
|---|---|---|
| `warrantyProvider` | String | Warranty provider / manufacturer name |
| `warrantyProviderType` | enum | `manufacturer` · `retailer` · `third_party` · `extended` · `unknown` |
| `warrantyContact` | String | Support phone / email |
| `warrantyWebsite` | String | Support / warranty page URL |
| `lifecycleStatus` | enum, default `owned` | `owned` · `in_use` · `stored` · `under_repair` · `sold` · `gifted` · `disposed` |
| `warranties[]` | subdoc array | Additional coverage periods: `type`, `provider`, `startDate`, `expiryDate`, `coverage`, `status`, `notes` (max 20) |

Rules enforced at create/update:

- each warranty period's `expiryDate` must be after its `startDate` (422 otherwise)
- blank warranty rows are normalized away (empty strings dropped)
- the existing primary-warranty check (`warrantyExpiryDate` after `purchaseDate`) is unchanged

UI: the product form gains lifecycle/provider fields and an editable
"Additional coverage periods" list (+ Add period / Remove); the product detail
view shows provider/lifecycle rows and coverage cards.

## Tranche 2 — Centralized warranty-status engine (shipped)

One source of truth for `not_started | active | expiring_soon | expired |
unknown`, per spec §5:

- **`src/services/warranty.service.js`** — canonical engine: `warrantyStatusOf`
  (per period), `primaryWarrantyStatus` (legacy expiry + purchase start),
  `statusLabel`. Expiring-soon window = **30 days** (matches the dashboard's
  existing expiring window). No expiry → `unknown`; future start → `not_started`.
- **Frontend mirror** — `public/js/warranty.js` mirrors the engine exactly
  (classic scripts share no module system) and is loaded before `utils.js`,
  whose `warrantyInfo()` now delegates to it (return shape preserved).
  Coverage cards show an engine-derived status chip.
- **No drift allowed** — `tests/warranty-status.test.js` runs both engines
  against identical fixtures (every status + exact 30-day boundary) and fails
  CI if they diverge.
- **Backend wiring** — `product.service` stamps each period's `status` on
  write from the engine, and product responses carry fresh `warrantyStatus` /
  `warrantyStatusLabel` for the primary warranty.

Tranche 3 note: the conflict rules in `intelligence.service.js` deliberately
reuse `startOfDay` semantics from the status engine so a "reversed dates"
conflict and the engine's status derivation agree about date boundaries.

## Tranche 3 — Warranty intelligence, deterministic (shipped)

Spec §19, no AI — pure rules over the product + the owner's other products.
Nothing is ever written or merged; everything is advisory.

- **`src/services/intelligence.service.js`** — `analyzeProduct(product, userId)`
  returns findings of three types:
  - `conflict` (warning) — expiry before purchase date, or a coverage period
    whose expiry precedes its start.
  - `missing` (info) — no warranty expiry anywhere (reminders can't be
    scheduled), or no purchase date when an expiry exists (timeline can't be
    drawn).
  - `duplicate` (info) — another of the user's active products matches by
    serial number, or by brand + model + store purchased within ~90 days.
    Findings carry `targetId` so the UI can link to the other product.
- **Endpoint** — `GET /api/v1/products/:id/intelligence` (owner-only via the
  existing `getProductById` ownership check). Duplicate matching is always
  scoped to the caller's own products.
- **UI** — the product detail view gains a **Warranty Health** panel that
  hides itself when there are no findings. Conflict/missing cards offer
  "Fix it" (opens the edit form); duplicate cards offer "View other product".
- **Tests** — `tests/intelligence.test.js`: unit coverage for every finding
  rule + API auth / cross-user denial / owner findings.

## Tranche 4 — Custom reminder schedules + maintenance reminders (shipped)

Spec §6/§7 — the notification system already had a per-user reminder-day
schedule and a `service_reminder` notification type; this tranche made them
user-configurable and added the maintenance half:

- **`User.notificationPreferences`** gains `maintenanceAlerts` (default `true`)
  alongside the existing `expiryAlerts` and `reminderDays`.
- **`PUT /api/v1/auth/preferences`** — partial update of expiry/maintenance
  alert toggles and the reminder-day schedule (`[90, 30, 14, 7, 1]`-style
  custom days, validated 1–365, max 10). An empty `reminderDays` array
  disables date-based reminders.
- **`createMaintenanceNotifications()`** — the nightly cron now also scans
  service records whose `nextServiceDate` lands on a configured reminder day
  and creates `service_reminder` notifications (distinct type, never mixed
  with `warranty_expiry` internally). Idempotent across runs; respects
  `maintenanceAlerts`. Both schedulers share `loadReminderDays()` and each
  failure is logged independently so one can't block the other.
- **UI** — the Notifications view gains a **Reminder settings** card
  (authenticated only): expiry + maintenance toggles and clickable day chips
  with a Save button. Service reminders render with a 🛠️ icon.
- **Tests** — scheduler creates one maintenance reminder per product+day and
  never duplicates on re-run; disabled alerts suppress reminders; preferences
  endpoint round-trips and validates bad payloads.

## Tranche 5 — Advanced product filtering + user-scoped tags (shipped)

Spec §9/§10/§11/§12:

- **Tags** — `Product.tags[]` (lower-cased + trimmed, deduped, max 20,
  validated 1–30 chars each). User-scoped automatically because products are.
  Editable in the product form; rendered as #chips on product cards;
  index `{ userId, isDeleted, tags }`.
- **Server-side filters** — `GET /api/v1/products` accepts category, brand,
  lifecycleStatus, warrantyStatus (translated to the engine's own date
  windows: 30-day expiring window, future purchase => not_started, missing
  expiry => unknown), purchaseStore, repeatable `tags` (AND), minPrice/maxPrice,
  purchaseFrom/To and expiryFrom/To. Sorting also accepts `purchasePrice`.
- **Extended search** — beyond name/brand/model, matches serial number,
  purchase store, warranty provider and tags (regex `$or`; a pure-regex plan
  avoids the Mongo "No query solutions" error from `$text` inside `$or`).
- **UI** — Products view gains a collapsible ⚙️ Filters panel (category
  datalist from the centralized `PRODUCT_CATEGORIES`, lifecycle select,
  warranty-status select, tags, store, price + purchase-date ranges) with
  Apply/Clear; guest mode filters the demo cache client-side.
- **Tests** — tag normalization/round-trip/cap, tag AND-filtering, per-filter
  assertions (lifecycle+category, warrantyStatus, price range, date range,
  brand), combined filters, cross-user isolation, serial/tag search.

## Tranche 6 — Warranty claim preparation + export (shipped)

Spec §15/§16:

- **`GET /api/v1/products/:id/claim`** — read-only claim snapshot for one
  product: identity, purchase info, provider + contact, primary status
  (engine-derived), additional coverage periods, service history and document
  metadata. Never includes file bytes or internal fields. Ownership-checked
  (403 cross-user).
- **`GET /api/v1/export/products?format=json|csv`** — downloads every live
  product with its warranties, service history and document *metadata* as an
  attachment. CSV follows RFC 4180 (quoting, doubled quotes, header row).
  Strictly scoped to the authenticated user.
- **`src/services/export.service.js`** — pure helpers (`toCsv`, `csvEscape`)
  unit-testable; `getClaimSummary` / `exportProducts` do the DB work.
- **UI** — product detail gains a **Prepare Claim** action opening a summary
  sheet with **Copy summary** (plain text) and **Download** (.txt); the
  Products view gains **⬇ JSON / ⬇ CSV** export buttons.
- **Tests** — claim fields + no internal leakage + 401/403; JSON/CSV export
  shape, RFC-4180 escaping (comma + embedded quotes), unknown-format
  fallback to JSON, cross-user emptiness, CSV helper units.

## Tranche 7 — Document verification + organization (shipped)

Spec §13/§14:

- **`PATCH /api/v1/documents/:documentId`** — partial update of `docState`
  (`unreviewed` / `reviewed` / `important` / `archived`), `verified`
  (manual user assertion), `tags` (≤20, normalized: trimmed, lowercased,
  deduped, blanks dropped), `notes` and `documentType`. Ownership-checked
  (403 cross-user); unknown fields stripped by Joi; oversize values 422.
- **Model** — `Document` gains `docState` (default `unreviewed`),
  `verified` (default `false`) and `tags[]`. Verification is **never** set
  by OCR or upload — `extracted ≠ verified` stays a hard separation.
- **UI** — every document card (Scan view + product detail) now shows the
  state chip, a ✓ Verified badge, #tag chips, and an inline state selector
  + Verify/Unverify toggle; the list re-renders after each change.
- **Tests** — 10 new: PATCH round-trip, partial-update preservation,
  normalization units, invalid state 422, oversize/many tags 422,
  cross-user 403, 404, and a default-state assertion proving OCR never
  auto-verifies.

## Tranche 8 — Secure product sharing (shipped)

Spec §17:

- **`Share` model** — one link = one product, `token` (48 hex chars from
  `crypto.randomBytes(24)`, unique-indexed, unguessable), optional `expiresAt`
  (1–90 days; null = never, still revocable), `revokedAt`.
- **Owner endpoints** — `POST/GET /api/v1/products/:productId/shares`,
  `DELETE .../shares/:shareId` — all ownership-checked (403 cross-user);
  revoked links stay listed (marked inactive) so the owner sees history.
- **Public endpoint** — `GET /api/v1/shared/:token` needs **no auth** (the
  token IS the credential); per-IP rate limited; unknown/revoked/expired
  tokens all return 404 so the URL space is not enumerable or probable.
- **Read-only by construction** — the snapshot includes product, warranty
  (engine-derived status), service history and document *metadata* (file
  name/type/size/date, docState, verified, tags, parsedData) — **never**
  file bytes, Cloudinary publicIds, OCR text or account internals. Soft-deleted
  products 404 even with a valid token.
- **UI** — product detail Quick Actions gains **Share** → modal with expiry
  presets (7 days / 30 days / never), one-click copy of the public link and
  inline revoke. New standalone `public/shared.html` renders the read-only
  snapshot (branded, no SPA, no auth) — the repair-technician view.
- **Tests** — 12: token format, expiry math, 422s, cross-user 403 on
  create/list/revoke, public no-auth snapshot with content assertions,
  private-field leak checks (fileUrl/publicId/ocrText absent from JSON),
  unknown/expired/revoked → 404, revoke-then-inactive, soft-deleted → 404.

## Open tranches (mapped to the spec)

6. **Family/shared ownership** (§18) — deliberately not built: it would
   require an auth-model review; secure per-product sharing (§17) already
   covers the stated use cases (technician/family read access).
7. **Notification center + preferences** (§22, §23) — type-specific rendering,
   in-app preference toggles (email only if a provider is configured).

## Constraints carried forward

- No AI / LLM features (§33) — deterministic logic first.
- No microservices / Redis unless required.
- Every new endpoint: `/api/v1`, auth, ownership, validation, pagination,
  consistent errors, OpenAPI doc.
- Existing Phase 1–3 tests must stay green; guest mode and OCR must keep
  working.

# Phase 4 — Advanced Product Features: Baseline

Status: **IN PROGRESS** — Tranches 1–3 shipped (data model, status engine, warranty intelligence).

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

## Open tranches (mapped to the spec)

1. **Custom reminder schedules + maintenance reminders** (§6, §7) — user
   preferences, duplicate-safe notification generation, maintenance
   next-service dates.
4. **Product lifecycle UI + filters** (§8, §9) — distinguish current vs
   archived/sold products, advanced filtering.
5. **Categories + tags** (§11, §12) — normalized categories, user-scoped tags.
6. **Document organization + verification** (§13, §14) — document states,
   tags/notes, user-verified flag.
7. **Warranty claim preparation + export** (§15, §16) — structured claim
   summary; CSV/JSON export.
8. **Secure sharing / family ownership** (§17, §18) — only if the architecture
   supports it cleanly (shared ownership requires an auth-model review first).
9. **Notification center + preferences** (§22, §23) — type-specific rendering,
   in-app preference toggles (email only if a provider is configured).

## Constraints carried forward

- No AI / LLM features (§33) — deterministic logic first.
- No microservices / Redis unless required.
- Every new endpoint: `/api/v1`, auth, ownership, validation, pagination,
  consistent errors, OpenAPI doc.
- Existing Phase 1–3 tests must stay green; guest mode and OCR must keep
  working.

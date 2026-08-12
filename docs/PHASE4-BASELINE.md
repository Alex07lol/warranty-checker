# Phase 4 — Advanced Product Features: Baseline

Status: **IN PROGRESS** — Tranche 1 (data model) and Tranche 2 (warranty-status engine) shipped.

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

## Open tranches (mapped to the spec)

1. **Custom reminder schedules + maintenance reminders** (§6, §7) — user
   preferences, duplicate-safe notification generation, maintenance
   next-service dates.
3. **Warranty intelligence (no AI)** (§19) — conflict detection, missing-info
   suggestions, OCR-review flags, duplicate suggestions (can reuse the engine
   to spot e.g. purchase-after-expiry inconsistencies).
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

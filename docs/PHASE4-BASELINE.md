# Phase 4 — Advanced Product Features: Baseline

Status: **IN PROGRESS** — Tranche 1 (data model foundation) shipped.

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
view shows provider/lifecycle rows and coverage cards. The centralized
**warranty-status engine** (spec §5) is the next tranche — `status` on each
period is currently stored as `unknown` by default until the engine derives it.

## Open tranches (mapped to the spec)

1. **Warranty-status engine** (§5) — one source of truth for
   not-started / active / expiring-soon / expired / unknown, shared by
   frontend and backend.
2. **Custom reminder schedules + maintenance reminders** (§6, §7) — user
   preferences, duplicate-safe notification generation, maintenance
   next-service dates.
3. **Warranty intelligence (no AI)** (§19) — conflict detection, missing-info
   suggestions, OCR-review flags, duplicate suggestions.
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

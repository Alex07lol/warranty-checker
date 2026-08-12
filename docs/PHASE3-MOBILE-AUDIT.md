# Phase 3 — Mobile UX Audit (360 px → 1440 px)

Audited 2026-08-12 against the spec's eight breakpoints: **360, 390, 412,
768, 1024, 1280, 1440 px**.

## Method (honest about limits)

- **Static layout audit** of `css/app.css` + `index.html` against each
  breakpoint: grid math, fixed-width traps, overflow sources, tap-target
  sizes, text wrapping, dialogs, nav, forms.
- **Browser automation was not available** (no Chrome/Chromium on this
  machine), so there was no pixel-perfect screenshot pass. Everything below is
  derived from the CSS math and must be spot-verified on real devices
  (see *Verify on device*).

## Architecture verdict

The stylesheet is **mobile-first with desktop-only `min-width` overrides**
(`768px` nav/columns, `390px` repair-card actions, `480px` new zoom relief).
There are no fixed-pixel grid columns, all long text truncates or wraps
(`ellipsis` on names/filenames, `overflow-wrap` on values), the app shell
(`.phone`/`.view`) clips horizontal overflow, dialogs are full-width bottom
sheets that scroll, and `prefers-reduced-motion` is honoured. This is the
right responsive architecture.

## Per-breakpoint findings

### 360 px (small phones — iPhone SE / older Android)
- **Fixed:** `--ui-scale` zoom (1.15) left only ~313 px of effective width —
  added a `max-width: 480px` override that drops the zoom to 1.05 (~343 px
  effective).
- **Fixed:** long Google addresses / product names / user names could push
  cards wider — added `overflow-wrap` to `.repair-card-address`,
  `.detail-product-name`, `.greeting-name`, `.detail-warranty-value`.
- **Fixed:** detail rows could crowd label vs value at the fixed 200 px cap —
  value now caps at `min(200px, 55%)`.
- Verified OK: 2-col stat grid (154 px cards), product cards with 80 px thumb
  + badge ellipsis, bottom nav `min(340px, 100% - 40px)`, upload row wraps,
  scan-error buttons `flex-wrap: wrap`, form sheet full-width + scrollable.

### 390 px
- `.repair-card-actions` switches to a row here (existing `min-width: 390px`
  query) — verified the contact buttons fit with `flex-wrap` fallback.

### 412 px
- Comfortable: same checks as 360 with more headroom. No additional issues.

### 768 px (tablets / small landscape)
- Nav becomes the top bar, 4-column stats, cards wrap at `300–340 px`
  (2 per row here). `.form-overlay` centers the sheet. Verified OK.

### 1024 / 1280 / 1440 px (desktop)
- Content column caps at 1000 px (`.view-scroll`, `.home-header`), card grid
  shows 3 per row, detail sheet caps at 720 px. No overflow risk at any of
  these widths.

## Fixes applied (css/app.css, "PHASE 3 — MOBILE UX AUDIT FIXES")

1. `@media (max-width: 480px) { html { zoom: 1.05 } }` — width relief on small phones.
2. `overflow-wrap` on repair address / detail product name / greeting / warranty value.
3. Tap targets raised toward comfort size: copy button 30→34 px, locate
   button 32→36 px, timeline actions `8px 14px`, login tabs `11px 9px`.
4. Detail-row value cap `min(200px, 55%)` so values keep breathing room.

## Remaining risks / verify on device

- **Real-device pass needed** (no browser here): pixel overflow, iOS Safari
  `100vh` + fixed bottom-nav behavior, landscape 360×640 login, text zoom.
- **Tap targets**: copy (34 px) and locate (36 px) are still below the 44 px
  WCAG target — acceptable for secondary actions, but bump if a11y pass asks.
- **`zoom` + media queries**: the `480px` zoom override is conservative and
  easy to tune if a device class misbehaves.
- **Long filenames**: ellipsized in lists; the document viewer shows the raw
  name in the detail sheet (wraps via `.detail-row-value` anywhere).

## How to do the real-device pass

```bash
# Boot locally and open http://localhost:5000, then use DevTools device
# mode at 360 / 390 / 412 / 768 / 1024 / 1280 / 1440 px:
cd API/backend && npm run demo
```
Check: dashboard, products, detail sheet, scan/OCR flow, notifications,
service timeline, repair centres, both light and dark mode, guest + logged-in.

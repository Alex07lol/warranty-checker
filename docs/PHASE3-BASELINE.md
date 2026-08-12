# Phase 3 — Production Readiness: Baseline Checklist

Established 2026-08-12 from a full inspection of `main` (tests 161/161 green,
live boot + smoke verified). This checklist drives the rest of Phase 3 — no
work is duplicated, only gaps are closed.

## Already complete

- **Env validation** (Phase 2): required vars enforced at boot, `JWT_EXPIRES_IN`
  duration format, `MONGO_URI` scheme, production `CLIENT_URL` wildcard fail-fast.
- **Targeted rate limits**: auth (10/15 min), uploads (10/min), OCR retries
  (15/10 min), Places proxy (120/15 min) — all env-overridable.
- **Upload hardening**: 5 MB cap, magic-byte signature validation
  (JPEG/PNG/WebP/PDF), Multer error mapping.
- **Authorization**: every resource userId-scoped (products, documents, service
  history, notifications, document view/stream).
- **Serial-number dedup** at the DB level (partial unique index) with graceful
  E11000 handling.
- **OCR reliability**: singleton tesseract worker with reset-on-failure, lazy
  ESM mupdf load, PDF page/width caps, stuck-`processing` recovery, injectable
  OCR for tests.
- **Data integrity**: Joi validators (price ≥ 0, ISO dates, required name),
  expiry > purchase enforcement in services, ObjectId validation.
- **Render blueprint**: `render.yaml` with secrets `sync: false`, free tier,
  `autoDeploy`, health check.
- **Security headers** (Helmet CSP), compression, immutable caching of vendored
  assets, guest demo mode.
- **CI**: install + full test suite on push/PR (main, develop).
- **Frontend effects**: `prefers-reduced-motion` respected, resize handlers.
- **Products** endpoint already paginated (page/limit/sort, capped at 100).

## Needs improvement (targeted, this phase)

1. **Observability** — no request IDs, plain-text morgan logs, errors not
   classified, no /ready, no graceful shutdown.
2. **OCR resource management** — no concurrency limit on OCR jobs; no job
   metrics.
3. **Pagination** — documents and notifications returned unbounded; service
   history uncapped.
4. **Config/deploy polish** — `.env.example` missing optional vars and had a
   stray `[TEMPLATE]` line; render health check pointed at `/`.
5. **CI** — no OCR simulation, no syntax check, no dependency audit.
6. **Docs** — no production checklist, backup/recovery, or security doc; README
   roadmap stale (Phase 2 listed IN PROGRESS despite being done).

## Actually missing (deferred or out of scope — documented honestly)

- **OpenAPI spec** — a machine-readable `openapi.yaml` + `/api/docs` route is
  planned; the human-readable `docs/api-design.md` + Postman collection exist.
- **External error monitoring** — none configured (free tier); structured logs
  are the trace path. Documented in `docs/PRODUCTION.md`.
- **Backups** — MongoDB Atlas free tier has no point-in-time restore; recovery
  strategy documented in `docs/PRODUCTION.md` (no fake guarantees).
- **Full a11y / mobile pass** — keyboard focus management, screen-reader
  labeling and multi-breakpoint testing are scheduled tranches.
- **Data export / account deletion** — not implemented; documented as planned.
- **Idempotency keys** — button-double-submit protection is a UI concern;
  reviewed during the frontend tranche.
- **Queue/worker for OCR** — deliberately NOT introduced: the in-process
  semaphore + singleton worker meets expected load (see `docs/PRODUCTION.md`).

## Definition of done for this phase

- `npm test` green, `npm run ocr:sim` green, live boot + `/health` + `/ready`
  verified, smoke test green.
- All changes committed per the identity mapping in `GIT_IDENTITIES.md`.

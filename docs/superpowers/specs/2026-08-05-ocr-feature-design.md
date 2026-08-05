# OCR for Documents — Design

- **Date:** 2026-08-05
- **Status:** Approved (design), awaiting implementation
- **Backend:** `API/backend` (Express + Mongoose)
- **Feature:** Extract text from uploaded receipts/warranty cards and auto-fill empty product fields

## Problem

Documents (receipts, warranty cards) are uploaded to Cloudinary and stored as metadata-only records, but their content is never read. Users must manually type expiry dates, prices, and serial numbers into products. There is no OCR anywhere in the stack (`docs/project-overview.md` lists "AI-based receipt parsing or OCR" as an intended enhancement).

## Goals

1. Extract raw text from uploaded receipt/warranty-card images automatically.
2. Parse structured fields from that text: **warranty expiry date**, **purchase price**, **serial number**.
3. Auto-fill those fields onto the product — **only when the product field is empty** (never overwrite user-entered data).
4. Surface the extracted text in the document detail so it's viewable/searchable.
5. Keep uploads fast and resilient (OCR runs async; failures are retryable).

## Decisions (confirmed with user)

| Decision | Choice | Reason |
|---|---|---|
| OCR goal | Text **and** auto-fill fields | Highest value for a warranty app |
| OCR engine | **tesseract.js** | Free, open-source, no API keys/accounts, runs in backend |
| Apply behavior | **Fill empty fields only** | Guards against OCR misreads corrupting data |
| Trigger | **Async after upload** + manual retry endpoint | Upload stays fast; stuck/failed docs recoverable |
| Document types | `receipt`, `warranty_card` only | Product photos/manuals have nothing to extract |
| PDFs | `skipped` | tesseract.js is image-only; no PDF→image conversion in v1 |

## Architecture

New service `src/services/ocr.service.js`:

- `runOcr(imageBytes)` — runs tesseract.js recognition. Uses a **module-level lazy singleton worker** (`createWorker("eng")`) so repeated OCRs don't re-initialize. Downloads `eng` traineddata on first use (needs outbound network at runtime).
- `parseDocumentText(text)` — pure function; regex + heuristics over raw OCR text. Returns:
  ```
  { warrantyExpiryDate: Date|null, purchasePrice: Number|null, serialNumber: String|null }
  ```
- `processDocument(document)` — orchestrator:
  1. Mark `ocrStatus = "processing"`, save.
  2. Fetch the image bytes (from the Cloudinary `publicId`/`secure_url`).
  3. `runOcr(bytes)` → raw text.
  4. `parseDocumentText(text)` → fields.
  5. Update the Document: `ocrText`, `parsedData`, `ocrStatus = "done"` (or `"failed"` + `ocrError` on any error).
  6. If any field parsed, call `applyOcrToProduct` (fill-empty only).

### Data model changes — `Document`

Add fields (defaults for existing rows):

```js
ocrStatus: { type: String, enum: ["pending", "processing", "done", "failed", "skipped"], default: "pending" },
ocrText: String,
parsedData: {
  warrantyExpiryDate: Date,
  purchasePrice: Number,
  serialNumber: String
},
ocrError: String
```

### Product service — `applyOcrToProduct(productId, parsedData)`

- Load product (already ownership-checked by caller).
- For each of `warrantyExpiryDate`, `purchasePrice`, `serialNumber`: set it **only if the product field is currently empty/null**.
- Saves only when something changed.

### API changes

- `GET /api/v1/products/:productId/documents` — response now includes `ocrStatus`, `ocrText`, `parsedData`, `ocrError` (via model).
- **New:** `POST /api/v1/products/:productId/documents/:documentId/ocr` — auth + ownership guard; re-runs `processDocument` synchronously for that doc and returns the updated document. Used to retry failed/stuck docs and as a manual trigger.

## Data flow

```
upload receipt → multer → Cloudinary → Document created (ocrStatus: "pending")
  → fire-and-forget: status="processing"
    → download image → tesseract recognize → raw text
    → parseDocumentText → parsedData
    → Document: ocrText, parsedData, status="done"
    → fill empty product fields (warrantyExpiryDate/purchasePrice/serialNumber)
  → on error: status="failed" + ocrError (product untouched, retry endpoint available)
PDF / non-receipt type → status="skipped", never processed
```

## Error handling

- OCR failure → document preserved with `ocrStatus="failed"` and `ocrError`; product untouched.
- Invalid document/product IDs → existing `AppError` conventions (400/404/403).
- Fire-and-forget task must `.catch()` and record the failure (never throw into the request handler).
- Worker init failure (e.g., no network for traineddata) → same `failed` path.

## Testing

- **Unit:** `parseDocumentText` against sample receipt text — assert expiry/price/serial extraction (including formats like `MM/DD/YYYY`, `$19.99`, `S/N: ABC123`).
- **Integration:** make `runOcr` injectable (constructor/param) so tests stub it with fixed text; verify:
  - Document gets `ocrStatus="done"`, `ocrText`, `parsedData`.
  - Product empty fields are filled; **non-empty fields are not overwritten**.
  - Non-receipt type / PDF → `skipped`, no product change.
  - Retry endpoint re-runs and returns the updated doc; 401 without token; 403 cross-user.
- **Manual smoke:** upload a real receipt image, hit the retry endpoint, confirm real text extraction.

## Explicitly out of scope (YAGNI)

- No PDF→image conversion (PDFs are `skipped`).
- No multi-language support (English only).
- No confidence scores surfaced in the UI.
- No background job queue / Redis.
- No overwriting existing product fields.
- No mobile UI changes beyond exposing the new fields in `DocumentModel` + an "Extract text" button (Flutter not installed here; Dart edits only, unverified build).

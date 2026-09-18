# OCR accuracy: the synthetic document corpus

WarrantyVault reads receipts and warranty cards, so "does OCR work?" is not a
code question, it is an *accuracy* question. This is how that accuracy is
measured, and how it is kept from regressing.

```
scripts/ocr-corpus.cjs   the catalogue: 21 documents + ground truth (data only)
scripts/ocr-corpus.mjs   renders each document to a real PDF / PNG
scripts/ocr-eval.mjs     runs the real pipeline over the render and scores it
tests/ocr-corpus.test.js asserts the same catalogue at the parser level
```

## Running it

```bash
npm test                  # the parser-level corpus test (fast, no downloads)
npm run ocr:corpus        # render the documents into scripts/.ocr-corpus/
npm run ocr:eval          # render, OCR for real, print an accuracy report
```

`ocr:eval` needs outbound network the first time (tesseract.js downloads the
~5 MB `eng` model into `~/.cache/warrantyvault-ocr`) and exits non-zero unless
every asserted field matches, so it can gate a release:

```bash
npm run ocr:eval -- --min 0.98   # tolerate 2% of field checks failing
npm run ocr:eval -- --only receipt-eu-comma-decimal
npm run ocr:eval -- --reuse      # score the existing render
```

The rendered corpus and the JSON report land in `scripts/.ocr-corpus/`
(git-ignored — it is ~60 MB and regenerated on demand).

## What the corpus contains

| capture | what it is | how it is rendered |
| --- | --- | --- |
| `digital` | emailed invoice, PDF certificate | a PDF with a real text layer |
| `scan` | flatbed scan of paper | the page rasterised, written **both** as a PNG and as an image-only PDF with no text layer (so the rasterize + tesseract fallback is exercised, not bypassed) |

Two structural traps are covered explicitly: **two-column layouts** (a
letterhead sharing a printed line with a tagline — the store parser must
column-split and prefer the registered legal entity) and **repeated data**
(the same serial printed under its label and again under a barcode).
| `photo` | phone photo of paper | a tilted, grainy, slightly soft, lower-contrast, sometimes faded PNG |

Across those captures the corpus covers: `$` / `£` / `€` / mangled-`₹` prices,
US and European groupings (`1,299.00` vs `1.299,00`), comma decimals, currency
codes, US slash dates, dotted European dates, word-month dates, single- and
two-page documents, cover stated as a period (`24 months`, `3 years`) instead of
an end date, extended-warranty letters, `Serial Number` / `S/N` / `IMEI` labels,
quantity columns, bare (symbol-less) amounts, receipts with no warranty at all,
and one page with nothing to extract that must not invent fields.

## Adding a document

1. Add an entry to `DOCUMENTS` in `scripts/ocr-corpus.cjs` with its `pages`
   (lines and two-cell rows), `capture`, `fileName` and `expected`.
2. Write `expected` from the *document*, never from what the parser currently
   outputs — otherwise the corpus only proves the parser agrees with itself.
   A field set to `null` is asserted to be null; an omitted field is not scored.
3. `npm run ocr:eval -- --only <id>` until it passes, then `npm test`.

## What it has caught

The corpus is not theoretical: it found every one of these in the shipped OCR
path, and `tests/ocr-corpus.test.js` keeps them fixed.

- **Scanned PDFs never OCR'd at all.** `page.getBounds()` returns an array, so
  `bounds.x1 - bounds.x0` was `NaN`, the render scale was `NaN`, and every
  rasterised page came back as a 0-byte PNG that crashed the tesseract worker
  (and, without an `errorHandler`, the whole process).
- **An invoice's issue date was stored as the warranty expiry.**
- **`Serial Number: 4A12345678` extracted the serial as `"NUMBER"`.**
- **`£299.99` extracted as `243299.99`**, and `1.299,00 EUR` was unreadable.
- **A warranty card's purchase date was reused as its expiry** instead of the
  cover period it printed.
- **An extended warranty lost to the "Original Expiry" it supersedes.**
- **A warranty letter's own title was stored as the purchase store.**
- **Product names came out as `"Covered until 15 March 2028"`, `"STORE"` or a
  bare amount** on documents whose columns the extractor split across lines.

## Model behaviour worth knowing

- `preserve_interword_spaces=1` is set on the worker: without it tesseract
  collapses the gap between an item and its price and the columns blur together.
- A photo whose first pass yields *no* fields is retried once with
  `tessedit_pageseg_mode=6` (single uniform block), which is what a receipt
  actually is; the parse with more fields wins.
- The corpus deliberately stops short of unreadable input. Damage is tuned to
  what a phone camera produces — pushing it further tests fantasy input, not the
  parser.

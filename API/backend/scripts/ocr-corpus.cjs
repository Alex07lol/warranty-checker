#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
   OCR CORPUS — the synthetic documents the OCR pipeline is measured against.

   Every entry describes ONE document the way a real one reaches the app
   (a receipt, a warranty card, an emailed invoice, a phone photo of a card),
   in a machine-readable layout that can be:

     1. RENDERED to a real PDF/PNG            → scripts/ocr-corpus.mjs
     2. PARSED as its plain-text equivalent   → tests/ocr-corpus.test.js
     3. OCR'd end to end and scored           → scripts/ocr-eval.mjs

   Ground truth lives in `expected` and is written from the *document*, never
   from what the parser currently outputs — otherwise the corpus would only
   ever prove the parser agrees with itself.

   Field semantics asserted here match the product record the app stores:
     productName  name AFTER the brand/model split (splitProductParts), because
                  that is the string the review form pre-fills
     brand/model/serialNumber/purchaseStore  exact strings
     purchaseDate/warrantyExpiryDate         local calendar dates (YYYY-MM-DD)
     purchasePrice                           number, currency symbol stripped
   A field listed as `null` is asserted to be null (no hallucination). A field
   simply omitted from `expected` is not scored at all.
   ───────────────────────────────────────────────────────────────────────────── */

// Page boxes in PDF points (72 dpi). "roll" is an 80 mm thermal receipt.
const PAGE_SIZES = {
  letter: [612, 792],
  a4: [595, 842],
  roll: [226, 700]
};

// Columns are as wide as a monospaced receipt printer would print, so a
// left/right row keeps a real gap between the label and the value.
const COLUMN_WIDTH = { letter: 46, a4: 46, roll: 26 };

// Render a left/centre/right row the way it would appear on paper: the first
// cell is left-aligned, the last one right-aligned, and the plain-text form
// keeps at least two spaces between them (so `\s{2,}` column heuristics in the
// parser are exercised rather than dodged).
function rowText(cells, columns) {
  const [first, ...rest] = cells;
  const tail = rest.join("  ");
  const width = Math.max(first.length + 2, columns - tail.length);
  return first.padEnd(width) + tail;
}

// The plain text of one rendered line. Used by the parser-level test suite and
// recorded in the manifest next to each file.
function lineText(line, columns) {
  if (line.row) return rowText(line.row, columns);
  return line.text;
}

function documentText(doc, pageIndex) {
  const pages = pageIndex === undefined ? doc.pages : [doc.pages[pageIndex]];
  return pages
    .map((page) => page.lines.map((line) => lineText(line, COLUMN_WIDTH[doc.page])).join("\n"))
    .join("\n");
}

const l = (text, extra) => ({ text, ...extra });
const row = (cells, extra) => ({ row: cells, ...extra });
const gap = (size = 10) => ({ gap: size });

const DOCUMENTS = [
  // ── Digital invoices / emailed receipts (text layer, no scanning noise) ────
  {
    id: "invoice-digital-usd",
    label: "Emailed invoice, USD, labeled fields, no warranty (expiry must stay empty)",
    documentType: "receipt",
    fileName: "invoice-INV-2026-0014.pdf",
    capture: "digital",
    page: "letter",
    files: ["pdf"],
    pages: [
      {
        lines: [
          l("ACME SUPPLY CO.", { size: 18, bold: true, align: "center" }),
          l("1200 Industrial Way, Springfield", { align: "center" }),
          l("INVOICE", { align: "center" }),
          gap(),
          l("Invoice Number: INV-2026-0014"),
          l("Invoice Date: 06/05/2026"),
          l("Bill To: Alex Morgan"),
          gap(),
          row(["Description", "Amount"], { bold: true }),
          row(["Refrigerator", "$1,299.00"]),
          row(["Subtotal", "$1,299.00"]),
          row(["Tax", "$0.00"]),
          row(["Amount Due", "$1,299.00"]),
          gap(),
          l("Brand: Frigidaire"),
          l("Model No: FRFG1723AV"),
          l("Serial Number: 4A12345678")
        ]
      }
    ],
    expected: {
      productName: "Refrigerator",
      brand: "Frigidaire",
      model: "FRFG1723AV",
      serialNumber: "4A12345678",
      purchaseDate: "2026-06-05",
      purchasePrice: 1299,
      purchaseStore: "ACME SUPPLY CO.",
      warrantyExpiryDate: null
    }
  },
  {
    id: "invoice-bare-total",
    label: "Emailed invoice, comma-grouped total with no currency symbol",
    documentType: "receipt",
    fileName: "northwind-invoice.pdf",
    capture: "digital",
    page: "letter",
    files: ["pdf"],
    pages: [
      {
        lines: [
          l("NORTHWIND TRADERS", { size: 16, bold: true }),
          l("Invoice Number: NW-2026-0417"),
          l("Invoice Date: 07/01/2026"),
          gap(),
          row(["Dishwasher", "2,499.00"]),
          row(["Order Total", "2,499.00"]),
          l("Model Number: WDT780SAEM")
        ]
      }
    ],
    expected: {
      productName: "Dishwasher",
      brand: null,
      model: "WDT780SAEM",
      purchaseDate: "2026-07-01",
      purchasePrice: 2499,
      purchaseStore: "NORTHWIND TRADERS",
      warrantyExpiryDate: null
    }
  },
  {
    id: "invoice-multipage-digital",
    label: "Two-page digital invoice — cover page first, data on page 2",
    documentType: "receipt",
    fileName: "northwind-invoice-NW-2026-0501.pdf",
    capture: "digital",
    page: "letter",
    files: ["pdf"],
    pages: [
      {
        lines: [
          l("NORTHWIND TRADERS", { size: 16, bold: true, align: "center" }),
          l("Invoice NW-2026-0501", { align: "center" }),
          gap(24),
          l("Thank you for your business.", { align: "center" }),
          l("Page 1 of 2", { align: "center" })
        ]
      },
      {
        lines: [
          l("NORTHWIND TRADERS", { size: 16, bold: true, align: "center" }),
          gap(),
          l("Date of Purchase: 08/11/2026"),
          row(["Dell XPS 13", "$1,499.00"]),
          row(["Total", "$1,499.00"]),
          gap(),
          l("Model No: XPS9345"),
          l("Warranty Expires: 08/11/2028")
        ]
      }
    ],
    expected: {
      productName: "XPS 13",
      brand: "Dell",
      model: "XPS9345",
      purchaseDate: "2026-08-11",
      purchasePrice: 1499,
      purchaseStore: "NORTHWIND TRADERS",
      warrantyExpiryDate: "2028-08-11"
    }
  },
  {
    id: "warranty-cert-digital-inr",
    label: "Digital warranty certificate, ₹ price mangled to 'I' by the PDF text layer",
    documentType: "warranty_card",
    fileName: "sample_warranty_certificate.pdf",
    capture: "digital",
    page: "a4",
    files: ["pdf"],
    pages: [
      {
        lines: [
          l("WARRANTY CERTIFICATE", { size: 18, bold: true, align: "center" }),
          l("Product Information", { bold: true }),
          gap(6),
          l("Product Name"),
          l("ApexBook Pro 14"),
          gap(6),
          l("Brand"),
          l("NexaTech"),
          gap(6),
          l("Model Number"),
          l("NBP-1402"),
          gap(6),
          l("Serial Number"),
          l("NTX-84K2-19P7"),
          gap(6),
          l("Purchase Date"),
          l("15 March 2026"),
          gap(6),
          l("Purchase Price"),
          l("I74,999.00"),
          gap(6),
          l("Seller"),
          l("TechPoint Electronics"),
          gap(6),
          l("Invoice Number"),
          l("TP-2026-0315-4821"),
          gap(6),
          l("Warranty Start"),
          l("15 March 2026"),
          gap(6),
          l("Warranty End"),
          l("14 March 2028")
        ]
      }
    ],
    expected: {
      productName: "ApexBook Pro 14",
      brand: "NexaTech",
      model: "NBP-1402",
      serialNumber: "NTX-84K2-19P7",
      purchaseDate: "2026-03-15",
      purchasePrice: 74999,
      purchaseStore: "TechPoint Electronics",
      warrantyExpiryDate: "2028-03-14"
    }
  },
  {
    id: "warranty-extended-letter",
    label: "Extended-warranty letter — the extended date must win over 'Original Expiry'",
    documentType: "warranty_card",
    fileName: "extended-warranty-EW-2026-8841.pdf",
    capture: "digital",
    page: "letter",
    files: ["pdf"],
    pages: [
      {
        lines: [
          l("Extended Warranty Confirmation", { size: 16, bold: true }),
          l("Reference: EW-2026-8841"),
          gap(),
          l("Serial Number: NTX-84K2-19P7"),
          l("Original Expiry: 14 March 2028"),
          l("Extended Warranty Expires: 14 March 2030")
        ]
      }
    ],
    expected: {
      serialNumber: "NTX-84K2-19P7",
      warrantyExpiryDate: "2030-03-14",
      purchaseDate: null,
      purchasePrice: null,
      purchaseStore: null
    }
  },
  {
    id: "warranty-card-unlabeled-expiry",
    label: "Warranty card whose expiry date carries no label at all",
    documentType: "warranty_card",
    fileName: "nespresso-warranty.pdf",
    capture: "digital",
    page: "a4",
    files: ["pdf"],
    pages: [
      {
        lines: [
          l("WARRANTY CARD", { size: 16, bold: true }),
          gap(),
          l("Product: Nespresso Vertuo Next"),
          l("Serial Number: NP-VN-4471"),
          l("Covered until 15 March 2028")
        ]
      }
    ],
    expected: {
      productName: "Vertuo Next",
      brand: "Nespresso",
      serialNumber: "NP-VN-4471",
      warrantyExpiryDate: "2028-03-15",
      purchasePrice: null
    }
  },
  {
    id: "warranty-card-no-dates",
    label: "Warranty card with identifying fields only — no dates, no price",
    documentType: "warranty_card",
    fileName: "card-serial-only.pdf",
    capture: "digital",
    page: "a4",
    files: ["pdf"],
    pages: [
      {
        lines: [
          l("WARRANTY CARD", { size: 16, bold: true }),
          gap(),
          l("Brand: Bosch"),
          l("Model: WAT286H0GB"),
          l("Serial Number: BSH-4471-2A")
        ]
      }
    ],
    expected: {
      brand: "Bosch",
      model: "WAT286H0GB",
      serialNumber: "BSH-4471-2A",
      purchaseDate: null,
      purchasePrice: null,
      warrantyExpiryDate: null
    }
  },
  {
    id: "warranty-card-gbp-term",
    label: "UK warranty card — price in £, cover expressed as '3 years' (no end date)",
    documentType: "warranty_card",
    fileName: "dyson-v12-warranty.pdf",
    capture: "digital",
    page: "a4",
    files: ["pdf"],
    pages: [
      {
        lines: [
          l("Warranty Certificate", { size: 16, bold: true, align: "center" }),
          gap(),
          l("Product Name"),
          l("Dyson V12 Detect"),
          gap(6),
          l("Brand"),
          l("Dyson"),
          gap(6),
          l("Model Number"),
          l("SV46"),
          gap(6),
          l("Serial Number"),
          l("DY-V12-8842"),
          gap(6),
          l("Purchased"),
          l("15 August 2025"),
          gap(6),
          l("Price"),
          l("£299.99"),
          gap(6),
          l("Guarantee"),
          l("3 years")
        ]
      }
    ],
    expected: {
      productName: "V12 Detect",
      brand: "Dyson",
      model: "SV46",
      serialNumber: "DY-V12-8842",
      purchaseDate: "2025-08-15",
      purchasePrice: 299.99,
      // 15 August 2025 + 36 months
      warrantyExpiryDate: "2028-08-15"
    }
  },

  // ── Scanned paper (PNG + an image-only PDF, no text layer) ────────────────
  {
    id: "warranty-card-two-column-hp",
    label: "Two-column warranty card — legal-entity letterhead against a tagline, 'Valid Till' expiry, serial printed twice (label + barcode)",
    documentType: "warranty_card",
    fileName: "hp-warranty-card.png",
    capture: "scan",
    page: "a4",
    files: ["png", "pdf"],
    degrade: { noise: 6, contrast: 0.9, rotate: 0.5 },
    pages: [
      {
        lines: [
          l("WARRANTY CARD", { size: 18, bold: true, align: "center" }),
          l("CUSTOMER COPY", { size: 11, align: "center" }),
          gap(8),
          // The two-column top band: a marketing tagline on the left and the
          // legal-entity letterhead on the right share one printed line, so
          // text extraction interleaves them into a single text line.
          row(["Inventing brighter tomorrows", "HP India Sales Pvt. Ltd."], { size: 10 }),
          row(["", "www.hp.com/in"], { size: 10 }),
          gap(8),
          l("Product Name : HP Laptop 15s"),
          l("Model Number : 15s-eq2143AU"),
          // The serial appears twice on the card: under its label and again
          // under the barcode, on the same text line after a column gutter.
          row(["Serial Number : 5CD2458XYZ", "5CD2458XYZ"], { size: 11 }),
          gap(6),
          l("Purchase Date : 12 AUG 2025"),
          l("Warranty Period : 1 Year (12 Months)"),
          l("Valid Till : 11 AUG 2026"),
          gap(8),
          l("Terms & Conditions", { bold: true }),
          l("1. This warranty covers manufacturing defects in materials and workmanship.", { size: 9 }),
          l("2. The warranty is valid only in India and is non-transferable.", { size: 9 }),
          l("3. Please retain this card and proof of purchase for warranty claims.", { size: 9 }),
          gap(8),
          l("RELIABLE | INNOVATIVE | TOGETHER FOR A BETTER TOMORROW", { size: 9 })
        ]
      }
    ],
    expected: {
      // "HP Laptop 15s" with the known brand split off (splitProductParts).
      productName: "Laptop 15s",
      brand: "HP",
      model: "15s-eq2143AU",
      serialNumber: "5CD2458XYZ",
      purchaseDate: "2025-08-12",
      purchasePrice: null,
      // The registered entity must beat the tagline fragment in the same
      // interleaved line (legal-entity preference in parseStore).
      purchaseStore: "HP India Sales Pvt. Ltd.",
      // Printed explicitly as "Valid Till" — not derived from the period.
      warrantyExpiryDate: "2026-08-11"
    }
  },
  {
    id: "receipt-pos-usd-scan",
    label: "Scanned POS receipt, USD, warranty expressed as a period",
    documentType: "receipt",
    fileName: "acme-pos-receipt.png",
    capture: "scan",
    page: "letter",
    files: ["png", "pdf"],
    degrade: { noise: 6, contrast: 0.92 },
    pages: [
      {
        lines: [
          l("ACME STORE", { size: 16, bold: true, align: "center" }),
          l("456 Market Street", { align: "center" }),
          l("Tel: 555-0134", { align: "center" }),
          gap(),
          l("Date: 06/15/2025"),
          l("Cashier: Dana"),
          gap(),
          row(["Item", "Price"], { bold: true }),
          row(["Refrigerator", "$899.99"]),
          row(["Total", "$899.99"]),
          gap(),
          l("S/N: SN1234567890"),
          l("Warranty: 24 months")
        ]
      }
    ],
    expected: {
      productName: "Refrigerator",
      serialNumber: "SN1234567890",
      purchaseDate: "2025-06-15",
      purchasePrice: 899.99,
      purchaseStore: "ACME STORE",
      // 15 June 2025 + 24 months
      warrantyExpiryDate: "2027-06-15"
    }
  },
  {
    id: "receipt-eu-comma-decimal",
    label: "German receipt — dotted dates, comma decimals, 'Garantie bis'",
    documentType: "receipt",
    fileName: "mediamarkt-beleg.png",
    capture: "scan",
    page: "a4",
    files: ["png", "pdf"],
    degrade: { noise: 5, contrast: 0.9 },
    pages: [
      {
        lines: [
          l("MediaMarkt Berlin", { size: 16, bold: true, align: "center" }),
          gap(),
          l("Datum: 15.03.2026"),
          l("Beleg-Nr: 4711"),
          gap(),
          row(["Artikel", "Betrag"], { bold: true }),
          row(["Kaffeemaschine", "1.299,00 EUR"]),
          row(["Gesamtbetrag", "1.299,00 EUR"]),
          gap(),
          l("Garantie bis 14.03.2028")
        ]
      }
    ],
    expected: {
      productName: "Kaffeemaschine",
      purchaseDate: "2026-03-15",
      purchasePrice: 1299,
      purchaseStore: "MediaMarkt Berlin",
      warrantyExpiryDate: "2028-03-14"
    }
  },
  {
    id: "receipt-qty-columns",
    label: "Warehouse receipt with a quantity column and a bare (symbol-less) amount",
    documentType: "receipt",
    fileName: "costco-receipt.png",
    capture: "scan",
    page: "letter",
    files: ["png", "pdf"],
    degrade: { noise: 7, contrast: 0.88, rotate: 0.6 },
    pages: [
      {
        lines: [
          l("COSTCO WHOLESALE", { size: 16, bold: true }),
          l("Member 112233"),
          l("Date 04/10/2026"),
          gap(),
          row(["Qty", "Item", "Amount"], { bold: true }),
          row(["1", "Vizio 55in TV", "$429.99"]),
          row(["TOTAL", "$429.99"]),
          gap(),
          l("S/N VZ-55-88231")
        ]
      }
    ],
    expected: {
      // The brand is split out of the name (asserted separately below), so the
      // stored name is what remains: "Vizio 55in TV" → "55in TV".
      productName: "55in TV",
      brand: "Vizio",
      serialNumber: "VZ-55-88231",
      purchaseDate: "2026-04-10",
      purchasePrice: 429.99,
      purchaseStore: "COSTCO WHOLESALE",
      warrantyExpiryDate: null
    }
  },
  {
    id: "receipt-grocery-no-warranty",
    label: "Plain grocery receipt — nothing warranty-shaped to find",
    documentType: "receipt",
    fileName: "whole-foods-receipt.png",
    capture: "scan",
    page: "letter",
    files: ["png", "pdf"],
    degrade: { noise: 6, contrast: 0.9, rotate: -0.5 },
    pages: [
      {
        lines: [
          l("WHOLE FOODS MARKET", { size: 15, bold: true }),
          gap(),
          l("Date: 09/03/2026"),
          gap(),
          row(["Bananas", "1.20"]),
          row(["Milk", "4.50"]),
          row(["TOTAL", "5.70"]),
          gap(),
          l("Thank you for shopping at Whole Foods")
        ]
      }
    ],
    expected: {
      purchaseDate: "2026-09-03",
      purchasePrice: 5.7,
      serialNumber: null,
      warrantyExpiryDate: null,
      brand: null,
      model: null
    }
  },
  {
    id: "warranty-card-serial-inline",
    label: "Scanned appliance warranty card — inline 'Serial #', 12-month term",
    documentType: "warranty_card",
    fileName: "ge-warranty-card.png",
    capture: "scan",
    page: "letter",
    files: ["png", "pdf"],
    degrade: { noise: 8, contrast: 0.86, rotate: 0.9 },
    pages: [
      {
        lines: [
          l("GE APPLIANCES", { size: 16, bold: true, align: "center" }),
          l("Warranty Certificate", { align: "center" }),
          gap(),
          l("Model: GFE28GYNFS"),
          l("Serial #: GEA-2026-0451"),
          l("Purchase Date: 02/14/2026"),
          l("Warranty Term: 1 year")
        ]
      }
    ],
    expected: {
      brand: "GE",
      model: "GFE28GYNFS",
      serialNumber: "GEA-2026-0451",
      purchaseDate: "2026-02-14",
      // 14 February 2026 + 12 months
      warrantyExpiryDate: "2027-02-14"
    }
  },
  {
    id: "scanned-pdf-multipage",
    label: "Scanned two-page PDF — cover letter first, receipt on page 2",
    documentType: "receipt",
    fileName: "scan-batch-0014.pdf",
    capture: "scan",
    page: "letter",
    files: ["pdf"],
    degrade: { noise: 6, contrast: 0.9, rotate: 0.4 },
    pages: [
      {
        lines: [
          l("Thank you for your purchase", { align: "center" }),
          l("Please keep this letter with your records", { align: "center" }),
          l("www.acme.example", { align: "center" })
        ]
      },
      {
        lines: [
          l("ACME STORE", { size: 16, bold: true, align: "center" }),
          gap(),
          l("Date: 03/15/2026"),
          row(["Refrigerator", "$899.99"]),
          row(["Total", "$899.99"]),
          gap(),
          l("S/N: SN1234567890"),
          l("Warranty Expires: 03/15/2027")
        ]
      }
    ],
    expected: {
      productName: "Refrigerator",
      serialNumber: "SN1234567890",
      purchaseDate: "2026-03-15",
      purchasePrice: 899.99,
      purchaseStore: "ACME STORE",
      warrantyExpiryDate: "2027-03-15"
    }
  },

  // ── Phone photos of paper (crooked, noisy, low contrast, faded ink) ───────
  {
    id: "receipt-thermal-roll-photo",
    label: "Phone photo of a thermal receipt roll — rotated, noisy, low contrast",
    documentType: "receipt",
    fileName: "photo-roll-receipt.png",
    capture: "photo",
    page: "roll",
    files: ["png"],
    degrade: { rotate: 1.1, noise: 7, blur: 1, contrast: 0.85 },
    pages: [
      {
        lines: [
          l("BEST BUY", { size: 11, bold: true, align: "center" }),
          l("Store #221", { size: 8, align: "center" }),
          gap(6),
          l("Date 03/15/2026", { size: 9 }),
          row(["1 REFRIGERATOR", "899.99"], { size: 9 }),
          row(["TOTAL", "899.99"], { size: 9, bold: true }),
          l("CARD ****1234", { size: 9 }),
          gap(6),
          l("Protection Plan: 3 years", { size: 9 }),
          l("Plan Expires 03/15/2029", { size: 9 })
        ]
      }
    ],
    expected: {
      productName: "REFRIGERATOR",
      purchaseDate: "2026-03-15",
      purchasePrice: 899.99,
      purchaseStore: "BEST BUY",
      // 15 March 2026 + 3 years
      warrantyExpiryDate: "2029-03-15"
    }
  },
  {
    id: "photo-imei-phone-receipt",
    label: "Phone photo of a handset receipt — IMEI instead of S/N",
    documentType: "receipt",
    fileName: "photo-phone-receipt.png",
    capture: "photo",
    page: "letter",
    files: ["png"],
    degrade: { rotate: 1.2, noise: 7, blur: 1, contrast: 0.85 },
    pages: [
      {
        lines: [
          l("SAMSUNG STORE", { size: 16, bold: true, align: "center" }),
          l("Brand: Samsung"),
          gap(),
          row(["Galaxy S24 Ultra", "$1,299.00"]),
          row(["TOTAL", "$1,299.00"]),
          gap(),
          l("IMEI: 352099001761481"),
          l("Model: SM-S921B"),
          l("Purchased: 07/09/2026"),
          l("Warranty Expires: 07/09/2028")
        ]
      }
    ],
    expected: {
      productName: "Galaxy S24 Ultra",
      brand: "Samsung",
      model: "SM-S921B",
      serialNumber: "352099001761481",
      purchaseDate: "2026-07-09",
      purchasePrice: 1299,
      purchaseStore: "SAMSUNG STORE",
      warrantyExpiryDate: "2028-07-09"
    }
  },
  {
    id: "photo-warranty-period-only",
    label: "Phone photo of a warranty card stating only a 24-month period",
    documentType: "warranty_card",
    fileName: "photo-warranty-card.png",
    capture: "photo",
    page: "letter",
    files: ["png"],
    degrade: { rotate: -0.9, noise: 7, blur: 1, contrast: 0.85 },
    pages: [
      {
        lines: [
          l("WARRANTY CARD", { size: 15, bold: true, align: "center" }),
          gap(),
          l("Brand: Whirlpool"),
          l("Model: WRF560"),
          l("Serial No: WP-778812"),
          l("Purchased: 04/02/2026"),
          l("Warranty Period: 24 Months")
        ]
      }
    ],
    expected: {
      brand: "Whirlpool",
      model: "WRF560",
      serialNumber: "WP-778812",
      purchaseDate: "2026-04-02",
      // 2 April 2026 + 24 months
      warrantyExpiryDate: "2028-04-02"
    }
  },
  {
    id: "photo-brand-item-receipt",
    label: "Phone photo of a brand-store receipt (brand on the item line, not the header)",
    documentType: "receipt",
    fileName: "photo-store-receipt.png",
    capture: "photo",
    page: "letter",
    files: ["png"],
    degrade: { rotate: 0.8, noise: 7, blur: 1, contrast: 0.86 },
    pages: [
      {
        lines: [
          l("SAMSUNG STORE", { size: 16, bold: true, align: "center" }),
          gap(),
          row(["Samsung Galaxy S24", "$999.00"]),
          row(["Total", "$999.00"]),
          gap(),
          l("Date: 05/20/2026"),
          l("Warranty valid until 05/20/2028")
        ]
      }
    ],
    expected: {
      productName: "Galaxy S24",
      brand: "Samsung",
      purchaseDate: "2026-05-20",
      purchasePrice: 999,
      purchaseStore: "SAMSUNG STORE",
      warrantyExpiryDate: "2028-05-20"
    }
  },
  {
    id: "photo-faded-thermal",
    label: "Faded convenience-store receipt — washed-out thermal ink, 1-year warranty",
    documentType: "receipt",
    fileName: "photo-faded-receipt.png",
    capture: "photo",
    page: "roll",
    files: ["png"],
    degrade: { rotate: 0.9, noise: 7, blur: 1, faded: 0.62 },
    pages: [
      {
        lines: [
          l("7-ELEVEN #33912", { size: 12, bold: true, align: "center" }),
          l("06/22/2026  14:32", { size: 9, align: "center" }),
          gap(6),
          row(["AIRPODS PRO 2", "$249.99"], { size: 9 }),
          row(["TOTAL", "$249.99"], { size: 9, bold: true }),
          gap(6),
          l("S/N: AP2-9931-XX", { size: 9 }),
          l("MANUFACTURER WARRANTY 1 YEAR", { size: 9 })
        ]
      }
    ],
    expected: {
      productName: "AIRPODS PRO 2",
      serialNumber: "AP2-9931-XX",
      purchaseDate: "2026-06-22",
      purchasePrice: 249.99,
      purchaseStore: "7-ELEVEN #33912",
      // 22 June 2026 + 12 months
      warrantyExpiryDate: "2027-06-22"
    }
  },
  {
    id: "photo-garbage-negative",
    label: "Photo with no document data at all — must not invent fields",
    documentType: "receipt",
    fileName: "photo-misc-scan.png",
    capture: "photo",
    page: "letter",
    files: ["png"],
    degrade: { rotate: 1.1, noise: 8, blur: 1, contrast: 0.85 },
    empty: true,
    pages: [
      {
        lines: [
          l("Thank you for your purchase", { align: "center" }),
          l("Please keep this receipt for your records", { align: "center" }),
          l("www.example.com", { align: "center" }),
          l("Phone: 555-0134", { align: "center" })
        ]
      }
    ],
    expected: {
      brand: null,
      model: null,
      serialNumber: null,
      purchaseDate: null,
      purchasePrice: null,
      purchaseStore: null,
      warrantyExpiryDate: null
    }
  }
];

// Fields the evaluation scores, in report order.
const SCORED_FIELDS = [
  "productName",
  "brand",
  "model",
  "serialNumber",
  "purchaseDate",
  "purchasePrice",
  "purchaseStore",
  "warrantyExpiryDate"
];

module.exports = { DOCUMENTS, SCORED_FIELDS, PAGE_SIZES, COLUMN_WIDTH, lineText, rowText, documentText };

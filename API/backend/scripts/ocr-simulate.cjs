#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
   OCR simulation — run the field parsers across the many ways a warranty or
   receipt can be laid out and print a pass/fail table per format.

   Usage:  npm run ocr:sim   (or: node scripts/ocr-simulate.cjs)
   ───────────────────────────────────────────────────────────────────────────── */
process.env.NODE_ENV = "test";
const {
  parseDocumentText,
  parseProductName,
  splitProductParts
} = require("../src/services/ocr.service");

const pad = (n) => String(n).padStart(2, "0");
// Local calendar date ("2028-03-14") — ISO strings shift on positive-offset
// timezones, which would make every assertion look off by one day.
const dstr = (d) => (d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : null);

// Each variant: { name, text, fileName, type, expect: { field: expected } }
// Only the fields listed in `expect` are scored; everything else is shown but
// not asserted (marked "-").
const VARIANTS = [
  {
    name: "1. Digital PDF certificate (label/value on separate lines)",
    fileName: "sample_warranty_certificate.pdf",
    type: "warranty_card",
    text: `WARRANTY CERTIFICATE

SAMPLE DOCUMENT — FOR TESTING WARRANTYVAULT OCR

Product Information

Product Name
ApexBook Pro 14

Brand
NexaTech

Model Number
NBP-1402

Serial Number
NTX-84K2-19P7

Category
Laptop

Purchase Details

Customer
Alex Morgan

Purchase Date
15 March 2026

Purchase Price
I74,999.00

Seller
TechPoint Electronics

Invoice Number
TP-2026-0315-4821

Warranty Coverage

Warranty Type
Limited Manufacturer Warranty

Warranty Period
24 Months

Warranty Start
15 March 2026

Warranty End
14 March 2028

Coverage
Manufacturing defects in parts and workmanship

Terms & Conditions

• This sample certificate is provided solely for software testing and OCR demonstration.
`,
    expect: {
      productName: "ApexBook Pro 14",
      brand: "NexaTech",
      model: "NBP-1402",
      serialNumber: "NTX-84K2-19P7",
      warrantyExpiryDate: "2028-03-14",
      purchaseDate: "2026-03-15",
      purchasePrice: 74999,
      purchaseStore: "TechPoint Electronics"
    }
  },
  {
    name: "2. POS receipt (inline labels, $ price)",
    fileName: "receipt.jpg",
    type: "receipt",
    text: `ACME STORE
S/N: SN1234567890
MFR DATE: 06/15/2025
EXP: 06/15/2027
Item           Price
Refrigerator   $899.99
Total          $899.99
`,
    expect: {
      productName: "Refrigerator",
      serialNumber: "SN1234567890",
      warrantyExpiryDate: "2027-06-15",
      purchaseDate: "2025-06-15",
      purchasePrice: 899.99,
      purchaseStore: "ACME STORE"
    }
  },
  {
    name: "3. Branded warranty card (US dates, inline labels)",
    fileName: "card.jpg",
    type: "warranty_card",
    text: `SAMSUNG
Brand: Samsung
Model: RF28T5
Serial No: SN-9932-XX
PURCHASE DATE: 03/15/2026
EXPIRES: 12/31/2027
Total: $1,299.99
`,
    expect: {
      brand: "Samsung",
      model: "RF28T5",
      serialNumber: "SN-9932-XX",
      warrantyExpiryDate: "2027-12-31",
      purchaseDate: "2026-03-15",
      purchasePrice: 1299.99
    }
  },
  {
    name: "4. Phone-photo OCR of a product box (sparse, noisy)",
    fileName: "scan.jpg",
    type: "warranty_card",
    text: `SONY
WH-1000XM5
Noise cancelling headphones
MFR 06/15/2025
EXP 06/15/2028
S/N SN123
`,
    expect: {
      productName: "WH-1000XM5",
      brand: "Sony",
      model: "WH-1000XM5",
      serialNumber: "SN123",
      warrantyExpiryDate: "2028-06-15",
      purchaseDate: "2025-06-15"
    }
  },
  {
    name: "5. Month-first dates + seller label + £",
    fileName: "dyson.jpg",
    type: "warranty_card",
    text: `Warranty Certificate
Product: Dyson V12
Purchased: March 15, 2026
Valid Through March 15, 2028
Seller: Dyson Store
Total: £499.00
`,
    expect: {
      brand: "Dyson",
      model: "V12",
      warrantyExpiryDate: "2028-03-15",
      purchaseDate: "2026-03-15",
      purchasePrice: 499,
      purchaseStore: "Dyson Store"
    }
  },
  {
    name: "6. ₹ receipt (Indian retail)",
    fileName: "bill.jpg",
    type: "receipt",
    text: `RELIANCE DIGITAL
S/N: RD-7788-99
Date: 04/10/2026
TOTAL: ₹4,999.00
Warranty till 04/10/2028
`,
    expect: {
      serialNumber: "RD-7788-99",
      purchaseDate: "2026-04-10",
      purchasePrice: 4999,
      warrantyExpiryDate: "2028-04-10",
      purchaseStore: "RELIANCE DIGITAL"
    }
  },
  {
    name: "7. Compact card (label: value pairs)",
    fileName: "compact.jpg",
    type: "warranty_card",
    text: `Brand: Sony
Model: WH-1000XM5
S/N: ABC-123
Expiry: 15 June 2028
Purchased: 05/01/2026
Total $349.00
`,
    expect: {
      brand: "Sony",
      model: "WH-1000XM5",
      serialNumber: "ABC-123",
      warrantyExpiryDate: "2028-06-15",
      purchaseDate: "2026-05-01",
      purchasePrice: 349
    }
  },
  {
    name: "8. Garbage/noise text (must extract nothing)",
    fileName: "noise.jpg",
    type: "warranty_card",
    text: "no structured data here",
    expect: {
      brand: null,
      model: null,
      serialNumber: null,
      warrantyExpiryDate: null,
      purchaseDate: null,
      purchasePrice: null,
      purchaseStore: null
    }
  },
  {
    name: "9. Emailed invoice (Amount Due, no symbol needed)",
    fileName: "invoice.pdf",
    type: "receipt",
    text: `ACME INVOICE
Invoice Number: INV-2026-0014
Invoice Date: 06/05/2026
Amount Due: $1,299.00
`,
    expect: {
      purchaseDate: "2026-06-05",
      purchasePrice: 1299
    }
  },
  {
    name: "10. UK-style dates + £ (US-parse semantics for numerics)",
    fileName: "uk.jpg",
    type: "warranty_card",
    text: `Date of Purchase: 10/04/2026
Guarantee valid until 10/04/2028
Price: £299.99
`,
    expect: {
      purchaseDate: "2026-10-04",
      warrantyExpiryDate: "2028-10-04",
      purchasePrice: 299.99
    }
  }
];

let totalChecks = 0;
let totalPass = 0;

function show(name, rows, allPass) {
  console.log("\n" + name);
  console.log("-".repeat(name.length));
  for (const [field, got, want, pass] of rows) {
    const mark = pass === null ? " - " : pass ? " ✓ " : " ✗ ";
    const gotS = got === null ? "null" : JSON.stringify(got);
    const wantS = want === undefined || want === null ? "null" : JSON.stringify(want);
    const note = pass === null ? "" : pass ? "" : ` (want ${wantS})`;
    console.log(` ${mark} ${field.padEnd(20)} ${gotS}${note}`);
  }
}

for (const v of VARIANTS) {
  const parsed = parseDocumentText(v.text);
  const name = parseProductName(v.text, v.fileName, v.type);
  const parts = splitProductParts(name, parsed.brand, parsed.model);
  const got = {
    productName: parts.productName,
    brand: parsed.brand,
    model: parsed.model,
    serialNumber: parsed.serialNumber,
    warrantyExpiryDate: dstr(parsed.warrantyExpiryDate),
    purchaseDate: dstr(parsed.purchaseDate),
    purchasePrice: parsed.purchasePrice,
    purchaseStore: parsed.purchaseStore
  };
  const rows = [];
  let allPass = true;
  for (const [field, want] of Object.entries(got)) {
    const asserted = field in v.expect;
    const pass = asserted ? got[field] === v.expect[field] : null;
    if (asserted) {
      totalChecks++;
      if (pass) totalPass++;
      else allPass = false;
    }
    rows.push([field, got[field], v.expect[field], pass]);
  }
  show(`${allPass ? "PASS" : "FAIL"}  ${v.name}`, rows, allPass);
}

console.log("\n" + "=".repeat(46));
console.log(`TOTAL: ${totalPass}/${totalChecks} field checks passed`);
console.log("=".repeat(46));
process.exit(totalPass === totalChecks ? 0 : 1);

/**
 * The synthetic document corpus in scripts/ocr-corpus.cjs, asserted at the
 * PARSER level.
 *
 * scripts/ocr-eval.mjs renders those documents to real PDFs and PNGs and runs
 * the actual tesseract pipeline over them (that is the accuracy measurement,
 * and it needs mupdf + the ~5 MB eng model, so it is not part of jest). This
 * suite takes the same catalogue and feeds each document's text straight to the
 * parsers, which keeps every regression the corpus has ever caught — the
 * invoice date read as an expiry, "Serial Number" read as the serial, a € amount
 * read as 243299.99 — in the ordinary `npm test` run.
 */
const { DOCUMENTS, documentText } = require("../scripts/ocr-corpus.cjs");
const {
  parseDocument,
  parseDocumentText,
  parseWarrantyMonths,
  parseAmountToken,
  parseDate,
  parseProductName,
  extractDocumentData
} = require("../src/services/ocr.service");

const pad = (n) => String(n).padStart(2, "0");

// Local calendar date, the way the corpus writes its ground truth.
function asDateString(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function asRecord(parsed) {
  return {
    productName: parsed.productName ? String(parsed.productName).trim() : null,
    brand: parsed.brand ? String(parsed.brand).trim() : null,
    model: parsed.model ? String(parsed.model).trim() : null,
    serialNumber: parsed.serialNumber ? String(parsed.serialNumber).trim() : null,
    purchaseDate: asDateString(parsed.purchaseDate),
    purchasePrice: parsed.purchasePrice === null || parsed.purchasePrice === undefined ? null : Number(parsed.purchasePrice),
    purchaseStore: parsed.purchaseStore ? String(parsed.purchaseStore).trim() : null,
    warrantyExpiryDate: asDateString(parsed.warrantyExpiryDate)
  };
}

describe("OCR corpus: parsers reproduce every document's ground truth", () => {
  for (const doc of DOCUMENTS) {
    test(`${doc.id} (${doc.capture})`, () => {
      const parsed = parseDocument(documentText(doc), {
        fileName: doc.fileName,
        documentType: doc.documentType
      });
      const got = asRecord(parsed);
      const want = Object.fromEntries(
        Object.entries(doc.expected).map(([field, value]) => [
          field,
          field === "purchaseDate" || field === "warrantyExpiryDate" ? asDateString(value) : value
        ])
      );
      expect(got).toMatchObject(want);
    });
  }

  test("every document declares at least one expectation", () => {
    for (const doc of DOCUMENTS) {
      expect(Object.keys(doc.expected).length).toBeGreaterThan(0);
    }
  });

  test("document ids are unique", () => {
    const ids = DOCUMENTS.map((doc) => doc.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("OCR corpus: text-layer column shapes", () => {
  // A PDF text layer breaks a table row into separate lines. These are the
  // shapes the renderer actually produces (see scripts/ocr-eval.mjs).
  test("reads an item row whose amount landed on the next line", () => {
    expect(parseProductName("ACME SUPPLY CO.\nRefrigerator\n$1,299.00\nTotal\n$1,299.00", "invoice.pdf", "receipt"))
      .toBe("Refrigerator");
  });

  test("reads the item after a column header when the row was split apart", () => {
    const text = "Item\nRefrigerator\nTotal\nS/N: SN1234567890\nPrice\n$899.99\n$899.99";
    expect(parseProductName(text, "receipt.pdf", "receipt")).toBe("Refrigerator");
  });

  test("reads a German table header and its row", () => {
    const text = "Datum: 15.03.2026\nArtikel\nKaffeemaschine\nGesamtbetrag\n1.299,00 EUR";
    expect(parseProductName(text, "beleg.pdf", "receipt")).toBe("Kaffeemaschine");
  });

  test("never returns an amount, a footer or a merchant as the product", () => {
    expect(parseProductName("1.299,00 EUR", "beleg.pdf", "receipt")).not.toBe("1.299,00 EUR");
    expect(parseProductName("SAMSUNG STORE\n$999.00", "x.pdf", "receipt")).not.toBe("SAMSUNG STORE");
    expect(parseProductName("Page 1 of 2\nThank you", "x.pdf", "receipt")).not.toBe("Page 1 of 2");
  });

  test("collapses the long whitespace runs OCR leaves between columns", () => {
    // The padding must not stop the item row being read (the brand is split off
    // the name later, by splitProductParts).
    const text = "Samsung Galaxy S24" + " ".repeat(90) + "$999.00\nTotal $999.00";
    expect(parseProductName(text, "x.pdf", "receipt")).toBe("Samsung Galaxy S24");
  });
});

describe("OCR corpus: field-level regressions the corpus caught", () => {
  test("an invoice's issue date is not a warranty expiry", () => {
    const parsed = parseDocumentText("Invoice Date: 06/05/2026\nAmount Due: $1,299.00");
    expect(parsed.purchaseDate.getFullYear()).toBe(2026);
    expect(parsed.warrantyExpiryDate).toBeNull();
  });

  test("a purchase date is never reused as the expiry date", () => {
    const parsed = parseDocumentText("Purchased: 04/02/2026\nWarranty Period: 24 Months");
    expect(asDateString(parsed.warrantyExpiryDate)).toBe("2028-04-02");
  });

  test("an extended warranty beats the original expiry it replaces", () => {
    const parsed = parseDocumentText(
      "Serial Number: NTX-84K2-19P7\nOriginal Expiry: 14 March 2028\nExtended Warranty Expires: 14 March 2030"
    );
    expect(asDateString(parsed.warrantyExpiryDate)).toBe("2030-03-14");
    expect(parsed.purchaseDate).toBeNull();
  });

  test("reads a serial that carries the word Number in its label", () => {
    expect(parseDocumentText("Serial Number: 4A12345678").serialNumber).toBe("4A12345678");
    expect(parseDocumentText("Serial Number\nNTX-84K2-19P7").serialNumber).toBe("NTX-84K2-19P7");
    expect(parseDocumentText("IMEI: 352099001761481").serialNumber).toBe("352099001761481");
  });

  test("does not mistake a document title for a merchant", () => {
    expect(parseDocumentText("Extended Warranty Confirmation\nReference: EW-2026-8841").purchaseStore).toBeNull();
    expect(parseDocumentText("Datum: 15.03.2026\nArtikel\nKaffeemaschine\nMediaMarkt Berlin").purchaseStore)
      .toBe("MediaMarkt Berlin");
  });

  test("reads dotted European dates day-first and slashes month-first", () => {
    expect(asDateString(parseDate("Garantie bis 14.03.2028"))).toBe("2028-03-14");
    expect(asDateString(parseDate("Guarantee valid until 10/04/2026"))).toBe("2026-10-04");
    // A field that cannot be a month forces the other order.
    expect(asDateString(parseDate("Garantie bis 15/03/2026"))).toBe("2026-03-15");
    expect(asDateString(parseDate("Guarantee valid until 03/15/2026"))).toBe("2026-03-15");
  });

  test("derives the expiry from the cover period when no end date is printed", () => {
    expect(parseWarrantyMonths("Warranty: 24 months")).toBe(24);
    expect(parseWarrantyMonths("Guarantee\n3 years")).toBe(36);
    expect(parseWarrantyMonths("Warranty Term: 1 year")).toBe(12);
    expect(parseWarrantyMonths("Manufacturer warranty 1 YEAR")).toBe(12);
    expect(parseWarrantyMonths("Thank you for shopping")).toBeNull();
    const parsed = parseDocumentText("Date: 06/15/2025\nS/N: SN1234567890\nWarranty: 24 months");
    expect(asDateString(parsed.warrantyExpiryDate)).toBe("2027-06-15");
  });

  test("a period alone never invents an expiry", () => {
    expect(parseDocumentText("Warranty: 24 months").warrantyExpiryDate).toBeNull();
  });
});

describe("OCR corpus: amount formats", () => {
  test("parses US and European groupings", () => {
    expect(parseAmountToken("1,299.00")).toBe(1299);
    expect(parseAmountToken("1.299,00")).toBe(1299);
    expect(parseAmountToken("2,499")).toBe(2499);
    expect(parseAmountToken("299.99")).toBe(299.99);
    expect(parseAmountToken("74,999.00")).toBe(74999);
  });

  test("reads amounts printed in German and with currency codes", () => {
    const parsed = parseDocumentText("Artikel              Betrag\nKaffeemaschine       1.299,00 EUR");
    expect(parsed.purchasePrice).toBe(1299);
  });

  test("keeps identifiers out of the price", () => {
    expect(parseDocumentText("Invoice Number\nTP-2026-0315-4821").purchasePrice).toBeNull();
    expect(parseDocumentText("IMEI: 352099001761481\nTOTAL").purchasePrice).toBeNull();
    expect(parseDocumentText("Phone: 555.0134").purchasePrice).toBeNull();
  });
});

describe("OCR corpus: recognition fallback", () => {
  test("retries a photo that produced nothing with a different page segmentation", async () => {
    const calls = [];
    const ocrFn = async (buffer, options = {}) => {
      calls.push(options.psm);
      return options.psm === 6 ? "ACME STORE\nRefrigerator $899.99\nTotal $899.99" : "   ";
    };
    const { text, parsed } = await extractDocumentData(Buffer.from("image"), {
      mimeType: "image/png",
      fileName: "photo.png",
      documentType: "receipt",
      ocrFn
    });
    expect(calls).toEqual([3, 6]);
    expect(text).toContain("Refrigerator");
    expect(parsed.purchaseStore).toBe("ACME STORE");
  });

  test("does not retry when the first pass already found fields", async () => {
    const calls = [];
    const ocrFn = async (buffer, options = {}) => {
      calls.push(options.psm);
      return "ACME STORE\nRefrigerator $899.99\nTotal $899.99";
    };
    await extractDocumentData(Buffer.from("image"), {
      mimeType: "image/png",
      fileName: "photo.png",
      documentType: "receipt",
      ocrFn
    });
    expect(calls).toEqual([3]);
  });
});

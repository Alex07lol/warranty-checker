const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { createWorker } = require("tesseract.js");
const Document = require("../models/Document");
const cloudinary = require("../config/cloudinary");
const logger = require("../utils/logger");
const { applyOcrToProduct } = require("./product.service");
const { createDocumentProcessingNotification } = require("./notification.service");

const OCR_DOCUMENT_TYPES = new Set(["receipt", "warranty_card"]);
const OCR_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const OCR_PDF_MIME_TYPE = "application/pdf";

// A PDF whose extracted text layer is shorter than this is treated as a
// scanned (image-only) document and routed through rasterize + tesseract.
const PDF_MIN_TEXT_CHARS = 30;
// Tesseract runs per page — cap the number of pages OCR'd so a big scanned
// manual doesn't hold the request for minutes.
const PDF_MAX_OCR_PAGES = 3;
// Cap the rendered page width so A3/blueprint scans don't explode the canvas.
const PDF_RENDER_MAX_WIDTH = 1600;

const MONTH_INDEX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

// A date as it appears on a document: numeric ("06/15/2027"), day-first
// word month ("15 March 2026") or month-first ("March 15, 2026").
const DATE_RE =
  /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\s*,?\s+\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?\s*,?\s+\d{2,4})/;

// Parse a date string in any of the common document formats. Numeric dates
// keep JS Date semantics (US order); word-month dates are built explicitly
// so "15 March 2026" and "March 15, 2026" both resolve to the right day.
function parseDateValue(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  let m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s*,?\s+(\d{2,4})$/);
  if (m) {
    const mo = MONTH_INDEX[m[2].slice(0, 3).toLowerCase()];
    if (mo !== undefined) return new Date(+m[3], mo, +m[1]);
  }
  m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s+(\d{2,4})$/);
  if (m) {
    const mo = MONTH_INDEX[m[1].slice(0, 3).toLowerCase()];
    if (mo !== undefined) return new Date(+m[3], mo, +m[2]);
  }
  return null;
}

// Shared helper (S4144): given a label line at index `i`, return the date
// found on the NEXT non-empty line ("Warranty End\n14 March 2028"). Stops at
// the first non-empty line so "Warranty Type\nLimited Manufacturer Warranty"
// never reaches a later date. Returns null when there is no follow-up date.
function nextDate(lines, i) {
  for (let j = i + 1; j < lines.length; j++) {
    const match = lines[j].match(DATE_RE);
    if (match) return match[1];
    if (lines[j].trim()) break;
  }
  return null;
}

function parseDate(text) {
  if (!text) return null;
  const lines = String(text).split(/\r?\n/);
  // Strongest expiry signals first; "Warranty End" beats a bare "Warranty"
  // line so a certificate's START date is never mistaken for the expiry.
  const END_LABEL =
    /\b(?:expiry|expiration|expires|valid\s*(?:thru|through)|good\s*until|warranty\s*end|warranty\s*expires?|end\s+of\s+warranty|exp)\b/i;
  const START_LABEL =
    /\b(?:warranty\s*start|start|begins?|valid\s*from|purchase\s*date|date\s*of\s*purchase|bought|sold|issued|mfr|mfg)\b/i;
  const DATE_LABEL =
    /\b(?:expiry|expiration|expires|exp|valid|warranty|guarantee|good\s*until|start|end|purchase|mfr|mfg|date|issued|bought|sold|from)\b/i;
  let fallback = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const inline = line.match(DATE_RE);
    const raw = inline ? inline[1] : DATE_LABEL.test(line) ? nextDate(lines, i) : null;
    if (!raw) continue;
    const date = parseDateValue(raw);
    if (!date) continue;
    if (fallback === null) fallback = date;
    if (START_LABEL.test(line)) continue;   // never an expiry
    if (END_LABEL.test(line) || /\b(?:warranty|guarantee|valid)\b/i.test(line)) {
      return date;
    }
  }
  return fallback;
}

function parsePrice(text) {
  if (!text) return null;
  const lines = String(text).split(/\r?\n/);

  // Currency-symbol prices. The ₹ glyph is frequently mangled in PDF text
  // layers (ReportLab/WinAnsi renders it as "I"), so price-labeled lines
  // additionally accept a bare price-like number.
  const CURRENCY = /[₹$€£]\s?(\d+(?:,\d{3})*(?:\.\d+)?)/;
  // Price-like bare numbers: comma-grouped thousands ("74,999.00") or any
  // number with a decimal ("120.00"). Never a bare integer — so serials and
  // invoice numbers ("SN1234567890", "TP-2026-0315-4821") are not prices.
  const BARE = /((?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)))/;
  const PRICE_LABEL =
    /\b(?:(?:grand\s*)?total|amount(?:\s*due)?|due|bal(?:ance)?|price|cost|invoice)\b/i;

  const toValue = (raw) => {
    const value = Number.parseFloat(raw.replaceAll(",", ""));
    return Number.isNaN(value) ? null : value;
  };

  // A label line with the value on the NEXT line ("Purchase Price\n₹74,999.00").
  const nextValue = (i) => {
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j].trim();
      if (t) return t;
    }
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!PRICE_LABEL.test(line)) continue;
    for (const candidate of [line, nextValue(i)]) {
      const match = (candidate || "").match(CURRENCY) || (candidate || "").match(BARE);
      if (match) return toValue(match[1]);
    }
  }

  const any = text.match(CURRENCY);
  return any ? toValue(any[1]) : null;
}

function parseSerial(text) {
  if (!text) return null;
  const SERIAL_TOKEN = /[A-Z0-9][A-Z0-9-]{3,}/i;
  const LABEL = /s\/?n\.?|serial/i;
  const JUNK = /^(number|no\.?|#)$/i;
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = LABEL.exec(line);
    if (!m) continue;
    // "S/N: SN123" → the token follows on the same line. "Serial Number" →
    // the trailing "Number" is just part of the label, so the value is on
    // the NEXT line ("Serial Number\nNTX-84K2-19P7").
    const rest = line.slice(m.index + m[0].length).trim().replace(/^[:#-]?\s*/, "");
    let value = rest && !JUNK.test(rest) ? rest : null;
    if (!value) {
      for (let j = i + 1; j < lines.length; j++) {
        const t = lines[j].trim();
        if (!t) continue;
        value = t;
        break;
      }
    }
    if (!value) continue;
    const serialMatch = SERIAL_TOKEN.exec(value);
    if (serialMatch) return serialMatch[0].toUpperCase();
  }
  return null;
}

// Best-effort purchase store/merchant name from OCR text. Priority: (1) a
// line with a store-ish keyword (STORE, SUPERMARKET, MART, …), (2) a
// "Thank you for shopping at X" footer, (3) the first plausible header line
// (receipts print the merchant at the top, under the item lines).
function parseStore(text) {
  if (!text) return null;
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const NOISE =
    /^(total|subtotal|grand\s*total|amount|balance|due|tax|vat|item|qty|price|serial|s\/?n|exp|expiry|mfr|date|www|http|thank|please|keep|address|phone|tel|email|receipt|warranty|guarantee|model|brand|product|invoice|bill|order|purchase)\b/i;
  const STORE_KEYWORD =
    /\b(store|supermarket|superstore|mart|outlet|shop|center|centre|inc|llc|ltd|corp|co\.?|gmbh|bazaar)\b/i;
  const SELLER_LABEL = /\b(seller|sold\s*by|store\s*name|merchant|purchased\s*from|bought\s*from)\b/i;

  // (0) Seller/sold-by label — value inline ("Seller: TechPoint") or on the
  // next line ("Seller\nTechPoint Electronics").
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(SELLER_LABEL);
    if (!m) continue;
    let value = line.slice(m.index + m[0].length).replace(/^[:#-]?\s*/, "").trim();
    if (!value) {
      for (let j = i + 1; j < lines.length; j++) {
        const t = lines[j];
        if (t) { value = t; break; }
      }
    }
    if (
      value && value.length >= 3 && value.length <= 60 && /[A-Za-z]/.test(value) &&
      !/^\$/.test(value) && !/^\d{1,2}[/-]\d/.test(value) && !NOISE.test(value)
    ) {
      return value;
    }
  }

  // (1) Line containing a store keyword, with letters, no price/date.
  // Merchant names are capitalized ("ACME STORE"), so require a capital
  // letter — lowercase OCR noise like "no structured data here" is skipped.
  for (const line of lines) {
    if (line.length < 3 || line.length > 60) continue;
    if (!/[A-Za-z]/.test(line)) continue;
    if (!/[A-Z]/.test(line)) continue;
    if (NOISE.test(line)) continue;
    if (!STORE_KEYWORD.test(line)) continue;
    if (/\$\s?\d/.test(line) || /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(line)) continue;
    return line;
  }

  // (2) Footer thank-you line ("Thank you for shopping at ACME").
  const thanks = text.match(
    /(?:thank\s*you\s*for\s*(?:shopping|your\s*(?:visit|purchase)|patronage)\s*(?:at|with)\s+)([A-Za-z0-9&.'-]+(?:\s+[A-Za-z0-9&.'-]+){0,3})/i
  );
  if (thanks) return thanks[1].trim();

  // (3) First plausible header line (merchant name is the receipt header).
  for (const line of lines) {
    if (line.length < 3 || line.length > 60) continue;
    if (!/[A-Za-z]/.test(line)) continue;
    if (!/[A-Z]/.test(line)) continue;
    if (NOISE.test(line)) continue;
    if (/\$\s?\d/.test(line) || /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length >= 1 && words.length <= 5) return line;
  }

  return null;
}

// Best-effort purchase date. Prefers a line with a purchase-ish label
// (DATE, PURCHASE, MFR, INVOICE, SOLD, …) that is NOT an expiry line, then
// falls back to the first date on any non-expiry line (receipts print the
// transaction date near the top). parseDate() already owns expiry extraction.
function parsePurchaseDate(text) {
  if (!text) return null;
  const lines = String(text).split(/\r?\n/);
  // Strong purchase-date labels take precedence over manufacture-date labels:
  // "MFR DATE" is a factory date, only a fallback proxy for the purchase date.
  const PURCHASE_LABEL = /(purchase|bought|sold|date of|invoice|transaction|issued|dated|paid)/i;
  const MANUFACTURE_LABEL = /(mfr|mfg|manufactur)/i;
  const EXPIRY_LABEL = /(expir|expires|valid thru|valid through|warranty|good until|exp\b)/i;

  const scan = (labelRe) => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (EXPIRY_LABEL.test(line)) continue;
      if (!labelRe.test(line)) continue;
      const inline = line.match(DATE_RE);
      const raw = inline ? inline[1] : nextDate(lines, i);
      if (raw) {
        const date = parseDateValue(raw);
        if (date) return date;
      }
    }
    return null;
  };    return scan(PURCHASE_LABEL) || scan(MANUFACTURE_LABEL) || scan(/.*/);
}

// Common consumer-electronics/appliance brands, longest first so a longer
// name ("Hewlett-Packard") wins over a substring brand ("HP") on the same
// line. Used by parseBrand to label the extracted product.
const KNOWN_BRANDS = [
  "Hewlett-Packard", "Morphy Richards", "Black+Decker", "KitchenAid",
  "Whirlpool", "Panasonic", "Samsung", "Electrolux", "Philips", "Siemens",
  "Mitsubishi", "Crompton", "Havells", "Prestige", "Lenovo", "Nintendo",
  "Logitech", "Microsoft", "Xiaomi", "OnePlus", "Toshiba", "Frigidaire",
  "DeLonghi", "Grundig", "Fujitsu", "Vizio", "Hisense", "Sharp", "Dyson",
  "Miele", "Nespresso", "Breville", "Rowenta", "Moulinex", "Kenwood",
  "Bissell", "Amana", "Maytag", "Faber", "Elica", "Voltas", "Godrej",
  "Lloyd", "Bajaj", "Orient", "Usha", "Pigeon", "Instant Pot", "Bosch",
  "Sony", "Dell", "Apple", "Asus", "Acer", "Huawei", "Canon", "Nikon",
  "GoPro", "JBL", "Bose", "DJI", "Zanussi", "Indesit", "Beko", "Krups",
  "Gaggia", "Sage", "Ninja", "Ryobi", "Makita", "DeWalt", "Milwaukee",
  "LG", "GE", "HP"
].sort((a, b) => b.length - a.length);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Best-effort product brand from OCR text. Priority: (1) a labeled line
// ("Brand: Samsung", "Manufacturer: Whirlpool"), (2) a known brand word on
// any non-store line ("Samsung Fridge   $499.99" → "Samsung"). Store-ish
// lines ("SAMSUNG STORE") and serial/date lines are skipped so a merchant
// name is never mistaken for a brand.
function parseBrand(text) {
  if (!text) return null;
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // (1) Explicit labels, inline value ("Brand: Samsung"). \b…\b keeps
  // "BRAND" inside "BRANDTEST-1" from being a label, and a REQUIRED
  // ":"/"-"/"#" separator keeps footer text like "please make sure to…" or
  // "MANUFACTURER WARRANTY…" from being read as brand labels.
  for (const line of lines) {
    const match = line.match(
      /\b(?:brand(?:\s*name)?|manufacturer|make|company)\b\s*[:#-]\s*([A-Za-z][A-Za-z0-9 .&'-]{1,40})/i
    );
    if (match) return match[1].trim();
  }

  // (1b) Bare label on its own line — the value is the NEXT line
  // ("Brand\nNexaTech"). The line must BE the label (not a sentence
  // containing the word) so footer noise is never picked up.
  for (let i = 0; i < lines.length; i++) {
    if (!/^(?:brand(?:\s*name)?|manufacturer|make|company)\s*:?\s*$/i.test(lines[i])) {
      continue;
    }
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j];
      if (!t) continue;
      if (
        t.length <= 40 && /^[A-Za-z]/.test(t) &&
        !/^\$/.test(t) && !/^\d{1,2}[/-]\d/.test(t) &&
        !/\b(?:total|subtotal|price|serial|s\/?n|expiry|model)\b/i.test(t)
      ) {
        return t;
      }
      break;   // next non-empty line doesn't look like a brand — stop here
    }
  }

  // (2) Known brand as a whole word on a plausible product line.
  for (const line of lines) {
    if (line.length < 3 || line.length > 80) continue;
    if (!/[A-Za-z]/.test(line)) continue;
    if (/\b(store|supermarket|superstore|mart|outlet|shop|center|centre|inc|llc|ltd|corp|gmbh|bazaar)\b/i.test(line)) continue;
    if (/\b(s\/?n|serial|mfr|exp|expiry|warranty)\b/i.test(line)) continue;
    for (const brand of KNOWN_BRANDS) {
      if (new RegExp("\\b" + escapeRegExp(brand) + "\\b", "i").test(line)) {
        return brand;
      }
    }
  }

  return null;
}

// Best-effort product model from OCR text. Priority: (1) a labeled line
// ("Model No: WH-1000XM5", "Item No.: XRT-4080"), (2) an unlabeled token
// mixing letters and digits with a hyphen/slash ("WH-1000XM5"), skipping
// serial/date/expiry lines so S/Ns aren't mistaken for models.
function parseModel(text) {
  if (!text) return null;
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // sku / p?n / type get \b boundaries ("Typewriter" must not match type);
  // the model/item/product/part/article alternatives keep their original
  // shapes (a trailing \b would break "Item No." — the dot kills the
  // boundary). No value capture: the value is sliced off m[0] below so a
  // label can hold its value either inline or on the next line.
  const MODEL_LABEL =
    /(?:model(?:\s*(?:no\.?|number|#))?|item\s*(?:no\.?|#)|product\s*(?:no\.?|#)|part\s*(?:no\.?|#)|article\s*(?:no\.?|#)|\bsku\b|\bp\/?n\b|\btype\s*(?:no\.?|#)?\b)/i;
  const SERIAL_LABEL = /\b(s\/?n|serial|mfr|mfg|exp|expiry|warranty|valid)\b/i;

  // (1) Explicit labels — value inline ("Model No: WH-1000XM5") or on the
  // next line ("Model Number\nNBP-1402").
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(MODEL_LABEL);
    if (!m || SERIAL_LABEL.test(line)) continue;
    const after = line.slice(m.index + m[0].length).replace(/^[.:#-]+\s*/, "").trim();
    let value = after;
    if (!value) {
      for (let j = i + 1; j < lines.length; j++) {
        const t = lines[j];
        if (t) { value = t; break; }
      }
    }
    if (value && value.length <= 40 && /^[A-Za-z0-9]/.test(value)) return value;
  }

  // (2) Unlabeled model-ish token (letters then digits, optional hyphen/slash).
  for (const line of lines) {
    if (line.length < 3 || line.length > 60) continue;
    if (SERIAL_LABEL.test(line)) continue;
    if (/\$\s?\d/.test(line)) continue;
    const match = line.match(/\b[A-Z]{1,8}[-/]?\d[A-Za-z0-9-]{1,14}\b/);
    if (match) return match[0];
  }

  return null;
}

// Split a suggested product name into brand/model + a cleaner name. The name
// heuristics often return a combined string ("Samsung Fridge") or the model
// itself ("WH-1000XM5"); this pulls the known brand prefix and any model
// token out of the name so the product record gets clean brand/model fields.
// The name is never emptied — Product requires one, so a too-short remainder
// falls back to the original suggestion.
function splitProductParts(rawName, brand, model) {
  const original = String(rawName || "").trim();
  let productName = original;
  const outBrand = brand || null;
  const outModel = model || null;

  if (outBrand && productName) {
    const remainder = productName
      .replace(new RegExp("^" + escapeRegExp(outBrand) + "\\s*", "i"), "")
      .trim();
    if (remainder.length >= 2) productName = remainder;
  }

  if (outModel && productName) {
    const remainder = productName
      .replace(new RegExp("(?:^|\\s)" + escapeRegExp(outModel) + "\\s*$", "i"), "")
      .trim();
    if (remainder.length >= 2) productName = remainder;
  }

  return {
    productName: productName.length >= 2 ? productName : original || "Product",
    brand: outBrand,
    model: outModel
  };
}

function parseDocumentText(text) {
  return {
    warrantyExpiryDate: parseDate(text),
    purchasePrice: parsePrice(text),
    serialNumber: parseSerial(text),
    purchaseStore: parseStore(text),
    purchaseDate: parsePurchaseDate(text),
    brand: parseBrand(text),
    model: parseModel(text)
  };
}

// Best-effort product name from OCR text. Priority: (1) an item line ending in
// a price ("Refrigerator   $899.99" → "Refrigerator"), (2) a line mixing
// letters and digits (model-like, e.g. "WH-1000XM5"), (3) the first
// non-noise alphabetic line, (4) the file name, (5) a generic fallback.
// OCR is noisy, so this only needs to be good enough to pre-fill the product
// form — users can edit the name afterwards.
function parseProductName(text, fileName, documentType) {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const NOISE =
    /^(total|subtotal|grand\s*total|amount|balance|due|tax|vat|item|qty|price|serial|s\/?n|exp|expiry|mfr|date|www|http|thank|please|keep|store|address|phone|tel|email|receipt|warranty|guarantee|model|brand|product|invoice|bill|order|purchase)\b/i;

  // (0) A labeled product name ("Product Name\nApexBook Pro 14").
  for (let i = 0; i < lines.length; i++) {
    if (!/\bproduct\s*name\b|\bitem\s*name\b/i.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j];
      if (!t) continue;
      if (
        t.length >= 2 && t.length <= 60 &&
        !/^\$/.test(t) && !/^\d{1,2}[/-]\d/.test(t) &&
        !/^(total|subtotal|price|serial|s\/?n|expiry)\b/i.test(t)
      ) {
        return t;
      }
      break;
    }
  }

  // (1) Item line: name followed by a price (two+ spaces before the $).
  for (const line of lines) {
    const match = line.match(/^(.+?)\s{2,}\$\s?\d/);
    if (!match) continue;
    const name = match[1].trim();
    if (name.length >= 3 && name.length <= 60 && !NOISE.test(name)) {
      return name;
    }
  }

  // (2) A line mixing letters and digits (model numbers, e.g. "Sony WH-1000XM5").
  for (const line of lines) {
    if (line.length < 3 || line.length > 60) continue;
    if (/[A-Za-z].*\d/.test(line) && !NOISE.test(line) && !/\$\s?\d/.test(line)) {
      return line;
    }
  }

  // (3) First plausible non-noise alphabetic line (1–5 words).
  for (const line of lines) {
    if (line.length < 3 || line.length > 60) continue;
    if (!/[A-Za-z]/.test(line)) continue;
    if (NOISE.test(line)) continue;
    if (/\$\s?\d/.test(line) || /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length >= 1 && words.length <= 5) return line;
  }

  // (4) File-name fallback ("sony-wh1000xm5.pdf" → "sony wh1000xm5"), unless
  // the stem is itself a generic label ("receipt.jpg" → "receipt").
  const stem = (fileName || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (stem && stem.length >= 2 && !NOISE.test(stem)) return stem.slice(0, 60);

  // (5) Generic fallback.
  return documentType === "warranty_card" ? "Warranty card product" : "Receipt product";
}

function isOcrEligible(document) {
  return (
    OCR_DOCUMENT_TYPES.has(document.documentType) &&
    (OCR_IMAGE_MIME_TYPES.has(document.mimeType) || document.mimeType === OCR_PDF_MIME_TYPE)
  );
}

let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    // tesseract.js defaults cachePath to ".", which would drop eng.traineddata
    // into the repo CWD. Cache it under the user's home instead.
    const cachePath = path.join(os.homedir(), ".cache", "warrantyvault-ocr");
    fs.mkdirSync(cachePath, { recursive: true });
    // 1 = OEM.LSTM_ONLY (neural-net engine, the modern default).
    workerPromise = createWorker("eng", 1, { cachePath }).catch((error) => {
      // A failed init (e.g. traineddata download error) must not poison the
      // singleton forever — reset so the next OCR call can retry.
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

async function runOcr(imageBuffer) {
  const worker = await getWorker();
  const { data } = await worker.recognize(imageBuffer);
  return data.text;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF support (mupdf — official MuPDF WASM build)
// ─────────────────────────────────────────────────────────────────────────────
// mupdf ships as an ESM-only module (top-level await), so it is loaded lazily
// with a dynamic import. The promise is memoized; a failed load resets it so a
// transient error doesn't poison future OCR attempts.
let mupdfPromise = null;

function getMupdf() {
  if (!mupdfPromise) {
    mupdfPromise = import("mupdf").catch((error) => {
      mupdfPromise = null;
      throw error;
    });
  }
  return mupdfPromise;
}

// Pull the text layer out of a PDF (fast path for digitally-generated PDFs
// such as emailed receipts/invoices). Returns "" for scanned PDFs.
async function extractPdfText(pdfBuffer) {
  const mupdf = await getMupdf();
  const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  try {
    const pageCount = doc.countPages();
    let text = "";
    for (let i = 0; i < pageCount; i++) {
      const page = doc.loadPage(i);
      const stext = page.toStructuredText();
      text += stext.asText() + "\n";
      stext.destroy();
      page.destroy();
    }
    return text;
  } finally {
    doc.destroy();
  }
}

// Render up to `maxPages` PDF pages to PNG buffers so the tesseract pipeline
// can OCR scanned (image-only) PDFs. Page width is capped so huge scans render
// at a sane resolution.
async function rasterizePdfPages(pdfBuffer, options = {}) {
  const maxPages = options.maxPages || PDF_MAX_OCR_PAGES;
  const mupdf = await getMupdf();
  const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  try {
    const pageCount = Math.min(doc.countPages(), maxPages);
    const buffers = [];
    for (let i = 0; i < pageCount; i++) {
      const page = doc.loadPage(i);
      const bounds = page.getBounds();
      const pageWidth = bounds.x1 - bounds.x0;
      const pageHeight = bounds.y1 - bounds.y0;
      const scale = Math.min(2, PDF_RENDER_MAX_WIDTH / Math.max(pageWidth, 1));
      const pixmap = page.toPixmap(
        mupdf.Matrix.scale(scale, scale),
        mupdf.ColorSpace.DeviceRGB,
        false,
        true
      );
      buffers.push(Buffer.from(pixmap.asPNG()));
      pixmap.destroy();
      page.destroy();
    }
    return buffers;
  } finally {
    doc.destroy();
  }
}

// OCR a PDF: use the embedded text layer when present (fast, accurate), and
// fall back to rasterizing pages + tesseract for scanned PDFs.
async function runPdfOcr(pdfBuffer, ocrFn = runOcr) {
  // Guard against non-PDF bytes (e.g. an empty/denied download) so the
  // failure reads like a file problem, not a cryptic mupdf parse error.
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.slice(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error(
      "Could not read the PDF — the stored file may be inaccessible. " +
        "Re-upload it to scan again."
    );
  }
  const extracted = await extractPdfText(pdfBuffer);
  if (extracted.replace(/\s+/g, " ").trim().length >= PDF_MIN_TEXT_CHARS) {
    return extracted;
  }
  const pages = await rasterizePdfPages(pdfBuffer);
  const texts = [];
  for (const png of pages) {
    try {
      texts.push(await ocrFn(png));
    } catch {
      // Skip pages the OCR engine couldn't read rather than failing the doc.
    }
  }
  return texts.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// OCR concurrency + metrics
// ─────────────────────────────────────────────────────────────────────────────
// Tesseract runs through one shared worker and mupdf rasterization is
// CPU-heavy, so concurrent OCR jobs are limited with a small in-process
// semaphore. Jobs beyond the limit queue (the document is already marked
// "processing" before it waits, so the UI just shows a spinner) instead of
// piling unbounded CPU work onto the event loop. On Render's 0.1 vCPU free
// tier, 2 concurrent jobs is already generous.
class Semaphore {
  constructor(max) {
    this.max = max;
    this.active = 0;
    this.queue = [];
  }
  async acquire() {
    if (this.active < this.max) {
      this.active += 1;
      return;
    }
    await new Promise((resolve) => this.queue.push(resolve));
    this.active += 1;
  }
  release() {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

const OCR_MAX_CONCURRENT = Math.max(1, Number(process.env.OCR_MAX_CONCURRENT) || 2);
const ocrSemaphore = new Semaphore(OCR_MAX_CONCURRENT);

// Counters only — no document contents, no PII. Exposed on /health.
const ocrMetrics = { started: 0, completed: 0, failed: 0 };

function getOcrMetrics() {
  return {
    ...ocrMetrics,
    active: ocrSemaphore.active,
    queued: ocrSemaphore.queue.length,
    maxConcurrent: OCR_MAX_CONCURRENT
  };
}

async function processDocument(document, options = {}) {
  document.ocrStatus = "processing";
  await document.save();

  await ocrSemaphore.acquire();
  const startedAt = Date.now();
  ocrMetrics.started += 1;
  const fields = {
    documentId: String(document._id),
    mimeType: document.mimeType
  };
  logger.info("OCR job started", fields);

  try {
    const ocrFn = options.ocrFn || runOcr;
    // pdfOcrFn is injectable for tests (mupdf is ESM-only and jest's CJS
    // runtime cannot load it); production always uses the real engine.
    const pdfOcrFn = options.pdfOcrFn || runPdfOcr;
    // Prefer the original upload buffer when available (avoids a delivery
    // round-trip that can be blocked by the Cloudinary account's media
    // delivery ACL); fall back to fetching the stored file (e.g. retries).
    let fileBuffer = options.fileBuffer;
    if (!fileBuffer) {
      fileBuffer = await fetchStoredFileBytes(document);
    }
    const text =
      document.mimeType === OCR_PDF_MIME_TYPE
        ? await pdfOcrFn(fileBuffer, ocrFn)
        : await ocrFn(fileBuffer);
    const parsed = parseDocumentText(text);

    // Suggest a product name for the review-and-confirm step, then split any
    // known brand prefix / model token out of it so the product record gets
    // clean brand + model fields (e.g. "Samsung Fridge" → brand "Samsung",
    // name "Fridge"). Standalone scans no longer auto-create a product here:
    // the extracted data is staged on the document and the user reviews and
    // corrects it (POST /documents/:id/confirm-product) before a product is
    // created, so an OCR misread can never silently become a junk product.
    const parts = splitProductParts(
      parseProductName(text, document.fileName, document.documentType),
      parsed.brand,
      parsed.model
    );
    parsed.productName = parts.productName;
    parsed.brand = parts.brand;
    parsed.model = parts.model;

    document.ocrText = text;
    document.parsedData = parsed;

    document.ocrStatus = "done";
    await document.save();

    // Best-effort product enrichment. A failure here (e.g. duplicate serial)
    // must NOT flip the document to "failed" — the OCR itself succeeded.
    if (document.productId) {
      try {
        await applyOcrToProduct(document.productId, parsed);
      } catch (applyError) {
        logger.error("OCR succeeded but product enrichment failed", {
          ...fields,
          error: applyError.message
        });
      }
    }
    // Phase 4 §22 — notify the owner that their document finished processing
    // (preference-gated; never breaks OCR).
    await createDocumentProcessingNotification(document);
    ocrMetrics.completed += 1;
    logger.info("OCR job completed", {
      ...fields,
      durationMs: Date.now() - startedAt
    });
    return document;
  } catch (error) {
    document.ocrStatus = "failed";
    document.ocrError = error.message;
    await document.save();
    // Phase 4 §22 — notify the owner that OCR failed so they can retry.
    await createDocumentProcessingNotification(document);
    ocrMetrics.failed += 1;
    logger.error("OCR job failed", {
      ...fields,
      durationMs: Date.now() - startedAt,
      error: error.message
    });
    return document;
  } finally {
    ocrSemaphore.release();
  }
}

// Download the stored bytes for a document. Tries the Cloudinary Admin API
// download endpoint first (API-key authenticated — immune to the media
// delivery ACL that blocks PDFs on this account), then falls back to the
// stored delivery URL. Used by OCR retries, where no upload buffer exists.
async function fetchStoredFileBytes(document) {
  if (document.publicId && cloudinary.isConfigured()) {
    try {
      const response = await cloudinary.fetchStoredAsset(document.publicId);
      // Mocked fetches in tests omit `ok`; only treat explicit false as a
      // failure and fall through to the delivery URL.
      if (response.ok !== false) {
        return Buffer.from(await response.arrayBuffer());
      }
    } catch {
      // Fall through to the delivery URL below.
    }
  }

  const response = await fetch(document.fileUrl);
  // Real fetch Response objects carry `ok`; a denial (e.g. Cloudinary
  // media-delivery ACL) surfaces as a non-OK status with an empty body.
  if (response.ok === false) {
    throw new Error(
      "Could not download the stored file (media delivery is restricted). " +
        "Re-upload the original to scan it again."
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

module.exports = {
  runOcr,
  runPdfOcr,
  extractPdfText,
  rasterizePdfPages,
  parseDocumentText,
  parseProductName,
  parseDate,
  parsePrice,
  parseSerial,
  parseStore,
  parsePurchaseDate,
  parseBrand,
  parseModel,
  splitProductParts,
  processDocument,
  fetchStoredFileBytes,
  isOcrEligible,
  getOcrMetrics,
  OCR_DOCUMENT_TYPES,
  OCR_IMAGE_MIME_TYPES,
  OCR_PDF_MIME_TYPE
};

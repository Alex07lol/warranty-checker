const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { createWorker } = require("tesseract.js");
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
// Never upscale more than this, however small the page claims to be.
const PDF_RENDER_MAX_SCALE = 3;

const MONTH_INDEX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

// A date as it appears on a document: numeric ("06/15/2027"), day-first
// word month ("15 March 2026") or month-first ("March 15, 2026").
const DATE_PATTERNS = [
  // Numeric dates, including the dotted European form ("15.03.2026").
  /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/,
  /\b\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}(?:,\s*|\s+)\d{2,4}\b/,
  /\b[A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*|\s+)\d{2,4}\b/
];

// OCR and PDF text extraction both pad columns with long runs of spaces
// ("Samsung Galaxy S24<80 spaces>$999.00"). Every line-based parser works on
// lines whose internal whitespace is collapsed, so length and shape checks
// judge the text rather than the padding.
function splitLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim());
}

function matchDate(str) {
  if (!str) return null;
  for (const pat of DATE_PATTERNS) {
    const m = str.match(pat);
    if (m) return m[0];
  }
  return null;
}

// Parse a date string in any of the common document formats. Numeric dates
// keep JS Date semantics (US order); word-month dates are built explicitly
// so "15 March 2026" and "March 15, 2026" both resolve to the right day.
// Years printed with two digits belong to this century ("06/15/25"), not to
// 1925 — which is what `new Date(25, 5, 15)` would build.
function normalizeYear(year) {
  return year < 100 ? year + 2000 : year;
}

// Numeric dates are month-first in the US ("06/15/2027") and day-first almost
// everywhere else ("15.03.2026"). Dots are the European convention, so dotted
// dates are read day-first and slashes keep US order; whenever one field cannot
// be a month the other order is used regardless.
function buildNumericDate(first, separator, second, year) {
  let dayFirst = separator === "." || first > 12;
  if (second > 12) dayFirst = false;
  const day = dayFirst ? first : second;
  const month = dayFirst ? second : first;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(normalizeYear(year), month - 1, day);
}

function parseDateValue(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const numeric = s.match(/^(\d{1,2})([./-])(\d{1,2})[./-](\d{2,4})$/);
  if (numeric) {
    return buildNumericDate(Number(numeric[1]), numeric[2], Number(numeric[3]), Number(numeric[4]));
  }
  let m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})(?:,\s*|\s+)(\d{2,4})$/);
  if (m) {
    const mo = MONTH_INDEX[m[2].slice(0, 3).toLowerCase()];
    if (mo !== undefined) return new Date(normalizeYear(+m[3]), mo, +m[1]);
  }
  m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*|\s+)(\d{2,4})$/);
  if (m) {
    const mo = MONTH_INDEX[m[1].slice(0, 3).toLowerCase()];
    if (mo !== undefined) return new Date(normalizeYear(+m[3]), mo, +m[2]);
  }
  return null;
}

// Shared helper (S4144): given a label line at index `i`, return the date
// found on the NEXT non-empty line ("Warranty End\n14 March 2028"). Stops at
// the first non-empty line so "Warranty Type\nLimited Manufacturer Warranty"
// never reaches a later date. Returns null when there is no follow-up date.
// Non-date noise lines (toll-free lines, URLs, QR labels) that interleave
// between a label and its date on multi-column layouts.
const DATE_INTERLEAVE_NOISE = /^(?:or\s+call|call|tel|phone|toll\s*free|www\.|https?:\/\/|scan\s+for)\b/i;

function nextDate(lines, i, reject) {
  let nonEmpties = 0;
  for (let j = i + 1; j < lines.length; j++) {
    if (reject && reject(lines[j])) continue;
    const match = matchDate(lines[j]);
    if (match) return match;
    const trimmed = lines[j].trim();
    if (trimmed) {
      nonEmpties++;
      if (DATE_INTERLEAVE_NOISE.test(trimmed) && nonEmpties <= 2) continue;
      break;
    }
  }
  return null;
}

const END_LABELS = [
  /\b(?:exp(?:ir(?:y|ation|es)?)?)\b/i,
  /\b(?:valid\s*(?:thru|through|until|till)|good\s*until|valid\s*to)\b/i,
  /\b(?:warranty\s*(?:end|expires?)|end\s+of\s+warranty)\b/i
];
const START_LABELS = [
  /\b(?:warranty\s*start|start|begins?|valid\s*from)\b/i,
  /\b(?:purchase[sd]?\s*date|date\s*of\s*purchase|purchased?|bought|sold|issued|mf[rg]|acquired)\b/i
];
// Words that precede a date on any document. Long alternation lists push the
// regex past SonarQube's complexity budget, so each family of labels lives in
// its own regex and the label check is "any of them matches".
const DATE_LABELS = [
  /\b(?:expiry|expiration|expires|exp|valid|until|till|bis)\b/i,
  /\b(?:warranty|guarantee|garantie|garantia|garantía|garanzia)\b/i,
  /\b(?:start|end|from)\b/i,
  /\b(?:purchase|mfr|mfg|date|issued|bought|sold)\b/i,
  /\bgood\s+until\b/i
];
const dateLabel = (line) => DATE_LABELS.some((re) => re.test(line));

// Any hint that the document is about cover at all. Used to decide whether an
// *unlabelled* date is a last-resort expiry: an invoice's issue date is not an
// expiry date, but a card's printed date probably is. The non-English keywords
// matter — a German receipt says "Garantie bis 14.03.2028".
const WARRANTY_CONTEXT_TERMS = [
  /\bwarrant(?:y|ies)\b/i,
  /\bguarantee\b/i,
  /\bgewa?hrleistung\b/i,
  /\bprotect(?:ion|ed)\b/i,
  /\bcover(?:ed|age)?\b/i,
  /\bexpir/i,
  /\bvalid\b/i,
  /\bgaranti[ae]s?\b/i
];
const warrantyContext = (text) => WARRANTY_CONTEXT_TERMS.some((re) => re.test(text));
// The cover was extended — that end date replaces the original one it extends.
const EXTENDED_LABELS = /\b(?:extend(?:ed|s|ing)?|extension|additional\s+cover)\b/i;

// 3 = cover was extended, 2 = labelled or contextual end date, 0 = an
// unlabelled date that only counts as a last resort.
function expiryTier(line) {
  if (EXTENDED_LABELS.test(line)) return 3;
  if (END_LABELS.some((re) => re.test(line)) || warrantyContext(line)) return 2;
  return 0;
}

function parseDate(text, options = {}) {
  if (!text) return null;
  const lines = splitLines(text);
  // The purchase date is not an expiry date, even as a last resort: a receipt
  // that prints only "06/22/2026  14:32" must not claim cover until that day.
  const exclude = options.excludeDate || null;
  // Strongest expiry signals first; "Warranty End" beats a bare "Warranty"
  // line so a certificate's START date is never mistaken for the expiry, and
  // "Extended Warranty Expires" beats the "Original Expiry" it supersedes.
  let fallback = null;
  let best = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const raw = matchDate(line) || (dateLabel(line) ? nextDate(lines, i) : null);
    if (!raw) continue;
    const date = parseDateValue(raw);
    if (!date) continue;
    // A purchase/start line is never an expiry — not even as a last resort,
    // because a warranty card that only prints its purchase date would
    // otherwise claim cover until the day it was bought.
    if (START_LABELS.some((re) => re.test(line))) continue;
    if (fallback === null) fallback = date;
    const tier = expiryTier(line);
    if (tier > 0 && (!best || tier > best.tier)) best = { tier, date };
  }
  if (best) return best.date;
  // No labelled expiry anywhere. Only fall back to an unlabelled date when the
  // document is warranty-shaped at all, and never to the date already read as
  // the purchase date — otherwise an invoice's issue date would be stored as
  // the warranty expiry.
  if (fallback && exclude && sameDay(fallback, exclude)) return null;
  return warrantyContext(text) ? fallback : null;
}

function sameDay(a, b) {
  return (
    a instanceof Date &&
    b instanceof Date &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ── money ────────────────────────────────────────────────────────────────────
// Amounts arrive in three shapes: symbol with US grouping ("$1,299.00"),
// symbol with European grouping ("€1.299,00"), and a bare number ("2,499.00")
// possibly followed by a currency code ("1.299,00 EUR", "4,999 INR"). Serial
// and invoice numbers must never be read as money, so a bare integer is only
// accepted on a price-labelled line.
const CURRENCY_CODES = "USD|EUR|GBP|INR|AUD|CAD|JPY|CHF|SEK|NOK|DKK|PLN|ZAR|AED|SGD";
const CURRENCY_HEAD = new RegExp(`[₹$€£]|\\b(?:${CURRENCY_CODES}|Rs\\.?)\\b`, "i");
// A currency code may trail an amount ("1.299,00 EUR"); it never changes the
// value, so it is consumed without capturing.
const MONEY_TOKEN = new RegExp(
  `(?:[₹$€£]|Rs\\.?\\s?)?\\s?(\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)(?:\\s?(?:${CURRENCY_CODES}|Rs\\.?))*`,
  "gi"
);
// Dates share the shapes money uses ("15.03.2026"), so they are removed before
// anything is read as an amount.
const DATE_LIKE = /\b\d{1,4}[./-]\d{1,2}[./-]\d{2,4}\b/g;
const PRICE_LABELS = [
  /\b(?:grand\s*)?total\b/i,
  /\bamount(?:\s*due)?\b/i,
  /\b(?:due|bal(?:ance)?|price|cost|invoice)\b/i,
  /\b(?:gesamtbetrag|betrag|summe|montant|importe|totaal)\b/i
];
const priceLabel = (line) => PRICE_LABELS.some((re) => re.test(line));

// Interpret one money token as a number, honouring both groupings:
//   "1,299.00" → 1299      (US: comma groups, dot decimals)
//   "1.299,00" → 1299      (EU: dot groups, comma decimals)
//   "2,499"    → 2499      (grouped thousands, no decimals)
//   "299.99"   → 299.99    (plain decimal)
function parseAmountToken(raw) {
  const token = String(raw || "").trim();
  const decimal = token.match(/^(\d[\d.,]*?)[.,](\d{1,2})$/);
  if (decimal) {
    const whole = decimal[1].replaceAll(".", "").replaceAll(",", "");
    return Number(`${whole}.${decimal[2]}`);
  }
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(token)) {
    return Number(token.replaceAll(",", "").replaceAll(".", ""));
  }
  if (/^\d+$/.test(token)) return Number(token);
  return null;
}

// Identifiers are not money: "TP-2026-0315-4821", "SN1234567890" and
// "NTX-84K2-19P7" all contain digits, and the digit groups inside them must
// never surface as amounts. Any word mixing letters and digits is blanked out
// before amounts are read.
const IDENTIFIER_LIKE = /\b(?=[\w-]*[A-Za-z])(?=[\w-]*\d)[\w-]{4,}\b/g;

// Every money-shaped token on a line, in order. `exact` marks the ones that
// really are amounts (a currency symbol/code, a decimal part or grouped
// thousands) as opposed to a bare integer that could be a serial number.
function moneyTokens(value) {
  const text = String(value || "").replace(DATE_LIKE, " ").replace(IDENTIFIER_LIKE, " ");
  const tokens = [];
  for (const match of text.matchAll(MONEY_TOKEN)) {
    // A match that stops in the middle of a longer number ("555.0134" read as
    // "555.01") is a phone number or a code, not an amount.
    if (/^\d/.test(text.slice(match.index + match[0].length))) continue;
    const amount = parseAmountToken(match[1]);
    if (amount === null) continue;
    const tail = text.slice(match.index + match[0].length);
    const marker =
      CURRENCY_HEAD.test(text.slice(Math.max(0, match.index - 4), match.index + match[0].length)) ||
      /^\s?(?:USD|EUR|GBP|INR|Rs\.?)/i.test(tail);
    tokens.push({
      amount,
      raw: match[0].trim(),
      exact: marker || /[.,]/.test(match[1])
    });
  }
  return tokens;
}

function parsePrice(text) {
  if (!text) return null;
  const lines = splitLines(text);

  // A label line with the value on the NEXT line ("Purchase Price\n₹74,999.00").
  const nextValue = (i) => {
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j].trim();
      if (t) return t;
    }
    return null;
  };

  // 1. A labelled amount is the most reliable: "Total $1,299.00" or
  //    "Gesamtbetrag\n1.299,00 EUR". A bare integer is accepted on such a line
  //    ("TOTAL 499") but only a short one — a 15-digit run is an IMEI, not a
  //    price, even when it shares a line with the word TOTAL.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!priceLabel(line)) continue;
    const inline = moneyTokens(line);
    const exact = inline.find((token) => token.exact);
    if (exact) return exact.amount;
    const bare = inline.find((token) => /^\d{1,7}$/.test(token.raw));
    if (bare) return bare.amount;
    // The value may sit on the next line ("Order Total\n2,499.00"). It has to
    // be an amount that ENDS that line — otherwise the next row's card number
    // ("CARD ****1234") would be read as the total.
    // A bare column-header line ("Description   Amount") is NOT a label with
    // a value on the next line: pulling it would adopt the first item row's
    // price ("Front Load Washer … 749.00") instead of the "Total" row further
    // down. Only label lines that name a specific figure may look ahead.
    const isHeaderOnly = columnHeader(line) || /^(?:description|item|article|bezeichnung)\b/i.test(line);
    if (!isHeaderOnly) {
      const next = nextValue(i);
      if (next) {
        const trailing = moneyTokens(next).filter((token) => token.exact).pop();
        if (trailing && next.trimEnd().endsWith(trailing.raw)) return trailing.amount;
      }
    }
  }

  // 2. Otherwise the first unambiguous amount anywhere in the document — a
  //    bare integer is not enough, it could be a serial or an invoice number.
  const exact = moneyTokens(String(text)).find((token) => token.exact);
  return exact ? exact.amount : null;
}

// Best-effort serial number. Recognises the labels real documents print:
// S/N, SN, Serial, Serial Number, Serial No., IMEI (handsets), Service Tag
// (Dell) and Product/Item code. The label may carry its value inline
// ("S/N: SN1234567890") or on the next line ("Serial Number\nNTX-84K2-19P7").
// A serial always contains a digit, which is what stops the label's own words
// ("Number", "Serial") from being returned as the value.
function parseSerial(text) {
  if (!text) return null;
  const SERIAL_TOKEN = /[A-Z0-9][A-Z0-9-]{3,}/i;
  // "Serial", "Serial Number", "Serial No.", "S/N", "SN.", "IMEI", "Service
  // Tag", "Product Code" — one label family per regex keeps each pattern
  // readable (and inside SonarQube's complexity budget).
  const LABELS = [
    // "S/N", "S/N.", "SN:" — but NOT the "SN-" at the head of the serial value
    // itself ("Serial Number: SN-2026-W80-04417" must yield the whole value,
    // so the label must be followed by a separator, not a hyphen).
    /\bs\/?n\.?(?=[\s:#,]|$)/i,
    /\bserial(?:\s+(?:number|no\.?|#))?\b/i,
    /\bimei\b/i,
    /\bservice\s+tag\b/i,
    /\bproduct\s+code\b/i
  ];
  const JUNK = /^(number|no\.?|#|code|tag|id)$/i;
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m = null;
    for (const label of LABELS) {
      m = label.exec(line);
      if (m) break;
    }
    if (!m) continue;
    const rest = line
      .slice(m.index + m[0].length)
      .trim()
      // Drop the separator and any label words the pattern left behind
      // ("Serial Number: 4A123…" → "4A123…").
      .replace(/^[:#-]?\s*/, "")
      .replace(/^(?:number|no\.?|#|code|tag|id)\b[:#-]?\s*/i, "")
      .trim();
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
    if (serialMatch && /\d/.test(serialMatch[0])) return serialMatch[0].toUpperCase();
  }
  return null;
}

const NOISE_PATTERNS = [
  /^(total|subtotal|grand\s*total|amount|balance|due|tax|vat|item|qty|price|serial|s\/?n|exp|expiry|mfr|date)\b/i,
  /^(www|http|thank|please|keep|store|address|phone|tel|email|receipt|warranty|guarantee|model|brand|product|invoice|bill|order|purchase)\b/i
];

// Lines that describe the *document* rather than the merchant. Without this a
// warranty letter's own title ("Extended Warranty Confirmation") or a
// reference line ("Reference: EW-2026-8841") is mistaken for the store.
const DOCUMENT_LINE_TERMS = [
  /\bwarrant(?:y|ies)\b/i,
  /\b(?:invoice|receipt|confirmation|statement|certificate)\b/i,
  /\b(?:policy|letter|notice|claim|reference)\b/i,
  /\b(?:page|serial|model|brand|bill|order)\b/i,
  /\b(?:thank|dear|customer|terms|conditions)\b/i
];
const documentLine = (line) => DOCUMENT_LINE_TERMS.some((re) => re.test(line));
// Table column headers (English and German) look like short capitalized lines
// and would otherwise be adopted as the merchant name.
const COLUMN_HEADER_TERMS = [
  /\b(?:item|items|description|desc)\b/i,
  /\b(?:qty|quantity|amount|price|total)\b/i,
  /\b(?:artikel|bezeichnung|menge|betrag|preis|summe)\b/i,
  /\b(?:montant|importe|totaal)\b/i
];
const columnHeader = (line) => COLUMN_HEADER_TERMS.some((re) => re.test(line));

function isNoise(val) {
  if (!val) return false;
  return NOISE_PATTERNS.some((pat) => pat.test(val));
}

// Best-effort purchase store/merchant name from OCR text. Priority: (1) a
// line with a store-ish keyword (STORE, SUPERMARKET, MART, …), (2) a
// "Thank you for shopping at X" footer, (3) the first plausible header line
// (receipts print the merchant at the top, under the item lines).
// Terms that identify a registered company ("HP India Sales Pvt. Ltd.",
// "ACME GmbH") — the strongest merchant signal on a letterhead or warranty
// card. Kept as separate small patterns for SonarQube's complexity budget.
const LEGAL_ENTITY_TERMS = [
  /\bpvt\.?|\bprivate\b/i,
  /\b(?:llp|llc|ltd\.?|limited|inc\.?)\b/i,
  /\bcorp(?:oration)?\b/i,
  /\bgmbh\b/i,
  /\bco\.?,?\s*(?:ltd|kg|ohg)\b/i,
  /\b(?:bv|nv|pty)\b/i,
  /\bs\.?a\.?r\.?l\.?\b/i
];
const legalEntity = (value) => LEGAL_ENTITY_TERMS.some((re) => re.test(value));

function parseStore(text) {
  if (!text) return null;
  const lines = splitLines(text).filter(Boolean);

  const STORE_KEYWORD =
    /\b(store|supermarket|superstore|mart|outlet|shop|center|centre|inc|llc|ltd|corp|co\.?|gmbh|bazaar)\b/i;
  const SELLER_LABEL = /\b(seller|sold\s*by|store\s*name|merchant|purchased\s*from|bought\s*from)\b/i;
  const looksLikeMerchant = (value) => {
    if (value.length < 3 || value.length > 60) return false;
    if (!/[A-Za-z]/.test(value) || !/[A-Z]/.test(value)) return false;
    if (isNoise(value)) return false;
    // Document furniture is not a merchant: titles, reference codes, labels,
    // or a table's column header row.
    if (documentLine(value) || columnHeader(value) || value.includes(":")) return false;
    if (/\$\s?\d/.test(value) || /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(value)) return false;
    return value.split(/\s+/).length >= 1 && value.split(/\s+/).length <= 5;
  };
  // splitLines collapses runs of spaces, which would erase the column gutters
  // of a two-column layout — segment splitting therefore works on end-trimmed
  // raw lines, judging each column segment independently of its neighbours.
  const columnSegments = () => {
    const segments = [];
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      for (const seg of line.split(/\s{2,}/)) {
        const value = seg.replace(/\s+/g, " ").trim();
        if (value) segments.push(value);
      }
      segments.push(line.replace(/\s+/g, " "));
    }
    return segments;
  };

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
      !/^\$/.test(value) && !/^\d{1,2}[/-]\d/.test(value) && !isNoise(value)
    ) {
      return value;
    }
  }

  // (1) A registered legal entity beats every other signal: on a two-column
  // card the letterhead ("HP India Sales Pvt. Ltd.") shares a printed line
  // with a tagline, and the merged line also contains "Ltd" — so this scan
  // must run BEFORE the raw keyword scan below, which would otherwise return
  // the whole interleaved line.
  const legalEntitySegment = columnSegments().find(
    (value) => legalEntity(value) && looksLikeMerchant(value)
  );
  if (legalEntitySegment) return legalEntitySegment;

  // (2) Line containing a store keyword, with letters, no price/date.
  // Merchant names are capitalized ("ACME STORE"), so require a capital
  // letter — lowercase OCR noise like "no structured data here" is skipped.
  for (const line of lines) {
    if (line.length < 3 || line.length > 60) continue;
    if (!/[A-Za-z]/.test(line)) continue;
    if (!/[A-Z]/.test(line)) continue;
    if (isNoise(line)) continue;
    if (!STORE_KEYWORD.test(line)) continue;
    if (/\$\s?\d/.test(line) || /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(line)) continue;
    return line;
  }

  // (3) Footer thank-you line ("Thank you for shopping at ACME").
  const thanks = text.match(
    /(?:thank\s*you\s*for\s*(?:shopping|your\s*(?:visit|purchase)|patronage)\s*(?:at|with)\s+)([a-z0-9&.'-]+(?:\s+[a-z0-9&.'-]+){0,3})/i
  );
  if (thanks) return thanks[1].trim();

  // (4) The header line: merchant names are capitalized ("ACME STORE"), so a
  // capital letter is required and lowercase OCR noise is skipped. A merchant
  // is normally more than one word, and a receipt whose extractions interleave
  // columns can put an item name before it, so multi-word candidates win.
  const merchants = columnSegments().filter((value) => looksLikeMerchant(value));
  return (
    merchants.find((line) => line.split(/\s+/).length >= 2) ||
    merchants[0] ||
    null
  );
}

// Best-effort purchase date. Prefers a line with a purchase-ish label
// (DATE, PURCHASE, MFR, INVOICE, SOLD, …) that is NOT an expiry line, then
// falls back to the first date on any non-expiry line (receipts print the
// transaction date near the top). parseDate() already owns expiry extraction.
function parsePurchaseDate(text) {
  if (!text) return null;
  const lines = splitLines(text);
  // Strong purchase-date labels take precedence over manufacture-date labels:
  // "MFR DATE" is a factory date, only a fallback proxy for the purchase date.
  const PURCHASE_LABEL_TERMS = [
    /purchase|purchased|bought|sold/i,
    /date of|invoice|transaction/i,
    /issued|dated|paid|datum/i
  ];
  const purchaseLabel = (line) => PURCHASE_LABEL_TERMS.some((re) => re.test(line));
  const manufactureLabel = (line) => /(mfr|mfg|manufactur)/i.test(line);
  const EXPIRY_LABEL_TERMS = [
    /expir|expires/i,
    /valid thru|valid through|valid until|valid\s*till|good until/i,
    /warranty|garantie|garantia|garantía|garanzia/i,
    /cover(?:ed|age)?|protect(?:ed|ion)/i,
    /exp\b/i
  ];
  const EXPIRY_LABEL = (line) => EXPIRY_LABEL_TERMS.some((re) => re.test(line));

  const scan = (hasLabel) => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // A blank line has no date of its own, and looking "through" it would
      // hand back the date printed on the next line — which on a warranty
      // letter is the expiry date, not the purchase date.
      if (!line.trim()) continue;
      if (EXPIRY_LABEL(line)) continue;
      if (!hasLabel(line)) continue;
      const raw = matchDate(line) || nextDate(lines, i, (next) => !next.trim() || EXPIRY_LABEL(next));
      if (raw) {
        const date = parseDateValue(raw);
        if (date) return date;
      }
    }
    return null;
  };

  return scan(purchaseLabel) || scan(manufactureLabel) || scan(() => true);
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
  const lines = splitLines(text).filter(Boolean);

  // (1) Explicit labels, inline value ("Brand: Samsung"). \b…\b keeps
  // "BRAND" inside "BRANDTEST-1" from being a label, and a REQUIRED
  // ":"/"-"/"#" separator keeps footer text like "please make sure to…" or
  // "MANUFACTURER WARRANTY…" from being read as brand labels.
  for (const line of lines) {
    const match = line.match(
      /\b(?:brand(?:\s*name)?|manufacturer|make|company)\b\s*[:#-]\s*([a-z][a-z0-9 .&'-]{1,40})/i
    );
    if (match) return match[1].trim();
  }

  // (1b) Bare label on its own line — the value is the NEXT line
  // ("Brand\nNexaTech"). The line must BE the label (not a sentence
  // containing the word) so footer noise is never picked up.
  for (let i = 0; i < lines.length; i++) {
    if (!/^(?:brand(?:\s*name)?|manufacturer|make|company)(?:\s*:)?\s*$/i.test(lines[i])) {
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
    // A *store line* is not a product line — but a receipt that ran its
    // merchant and its item together ("SAMSUNG STORE Samsung Galaxy S24") still
    // carries a brand, so only short store lines are skipped.
    if (/\b(store|supermarket|superstore|mart|outlet|shop|center|centre|inc|llc|ltd|corp|gmbh|bazaar)\b/i.test(line) && line.split(/\s+/).length <= 3) continue;
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
  const lines = splitLines(text).filter(Boolean);

  // sku / p?n / type get \b boundaries ("Typewriter" must not match type);
  // the model/item/product/part/article alternatives keep their original
  // shapes (a trailing \b would break "Item No." — the dot kills the
  // boundary). No value capture: the value is sliced off m[0] below so a
  // label can hold its value either inline or on the next line.
  const MODEL_LABELS = [
    /model(?:\s*(?:no\.?|number|#))?/i,
    /(?:item|product|part|article)\s*(?:no\.?|#)/i,
    /\b(?:sku|p\/?n|type(?:\s*(?:no\.?|#))?)\b/i
  ];
  const findModelMatch = (str) => {
    for (const pat of MODEL_LABELS) {
      const m = str.match(pat);
      if (m) return m;
    }
    return null;
  };
  const SERIAL_LABEL = /\b(s\/?n|serial|mfr|mfg|exp|expiry|warranty|valid)\b/i;

  // (1) Explicit labels — value inline ("Model No: WH-1000XM5") or on the
  // next line ("Model Number\nNBP-1402").
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = findModelMatch(line);
    if (!m || SERIAL_LABEL.test(line)) continue;
    const after = line.slice(m.index + m[0].length)
      // Separators plus OCR look-alikes for them (":" misread as "©", "ⓒ", "→").
      .replace(/^[^A-Za-z0-9]+/, "").trim();
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

// Cover length in months, as documents print it: "Warranty: 24 months",
// "Guarantee 3 years", "Protection Plan: 18 mths", "Warranty Term
// 1 year". Returns null when the document states no period.
const PERIOD_LABEL =
  /\b(?:warrant(?:y|ies)|guarantee|garantie|garantia|garantía|garanzia|cover(?:age|ed)?|protect(?:ion|ed)|term|period|plan)\b/i;
const PERIOD_VALUE = /\b(\d{1,3})\s*(months?|mths?|mo|years?|yrs?|yr)\b/i;

function parseWarrantyMonths(text) {
  if (!text) return null;
  const lines = splitLines(text);
  const nextValue = (i) => {
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim()) return lines[j];
    }
    return "";
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || !PERIOD_LABEL.test(line)) continue;
    // Skip the cover-length statement of a *start* line: "Warranty Start":
    // the period is printed separately.
    const match = line.match(PERIOD_VALUE) || nextValue(i).match(PERIOD_VALUE);
    if (!match) continue;
    const count = Number(match[1]);
    if (!count || count > 240) continue;
    return /^y/i.test(match[2]) ? count * 12 : count;
  }
  return null;
}

// Add months to a date without the JS rollover surprise (31 Jan + 1 month must
// not become 3 March).
function addMonths(date, months) {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() !== day) result.setDate(0);
  return result;
}

function parseDocumentText(text) {
  // The purchase date is read first so the expiry parser can refuse to reuse it
  // (a document that only prints the day it was bought has no end date).
  const purchaseDate = parsePurchaseDate(text);
  const parsed = {
    warrantyExpiryDate: parseDate(text, { excludeDate: purchaseDate }),
    purchasePrice: parsePrice(text),
    serialNumber: parseSerial(text),
    purchaseStore: parseStore(text),
    purchaseDate,
    brand: parseBrand(text),
    model: parseModel(text)
  };

  // A document that states how long the cover lasts ("Warranty: 24 months",
  // "Guarantee 3 years") but prints no end date still has a computable expiry:
  // purchase date + period. Derived only when the document really gives a
  // start date, so a bare period can never invent an expiry out of nothing.
  if (!parsed.warrantyExpiryDate && parsed.purchaseDate) {
    const months = parseWarrantyMonths(text);
    if (months) {
      const derived = addMonths(parsed.purchaseDate, months);
      if (derived > parsed.purchaseDate) parsed.warrantyExpiryDate = derived;
    }
  }

  // Mirror derivation: a card that prints the expiry and the cover length but
  // whose purchase date is OCR-garbled ("12 AUG 2025" read as "S2VNUGR2025")
  // still yields a faithful start date: expiry − period.
  if (!parsed.purchaseDate && parsed.warrantyExpiryDate) {
    const months = parseWarrantyMonths(text);
    if (months) {
      const derived = addMonths(parsed.warrantyExpiryDate, -months);
      if (derived < parsed.warrantyExpiryDate) parsed.purchaseDate = derived;
    }
  }

  return parsed;
}

// A line that is nothing but an amount — the second half of an item row whose
// columns the PDF text layer (or OCR) broke onto its own line.
const MONEY_ONLY = /^(?:[₹$€£]|rs\.?)? ?\d[\d.,]* ?(?:usd|eur|gbp|inr)?$/i;
const PAGE_HEADER = /^page\s*\d+\s*(?:of\s*\d+)?$/i;
// Column headers and label lines that sit on top of an item table.
const NAME_REJECT_TERMS = [
  /^(?:item|items|description|desc|qty|quantity)\b/i,
  /^(?:amount|price|total|subtotal|tax|vat|date|time|cashier)\b/i,
  /^(?:card|change|balance|tel|phone|fax|email)\b/i,
  /^(?:www|http|address|invoice|receipt|store|branch)\b/i,
  /^(?:ref|reference|no|number|gst|tin)\b/i,
  /^(?:artikel|bezeichnung|menge|betrag|gesamtbetrag|preis|summe)\b/i,
  /^(?:montant|importe)\b/i
];
const nameReject = (value) => NAME_REJECT_TERMS.some((re) => re.test(value));
// The column header that introduces an item table.
const ITEM_HEADER =
  /^(?:(?:qty|quantity)\s+)?(?:item|items|description|desc|artikel|bezeichnung)(?:\s+(?:qty|quantity|price|amount|preis|betrag|total))?$/i;

// Normalise a candidate product name, rejecting the document furniture that
// would otherwise be mistaken for a product: page footers, table headers,
// label lines, dates and standalone amounts. Returns null when unusable.
function cleanItemName(value) {
  const collapsed = String(value || "").replace(/\s+/g, " ").trim();
  // Drop a leading quantity column ("1 Vizio 55in TV", "2 x AirPods").
  const name = collapsed.replace(/^\d{1,3}\s*[xX]?\s+/, "").replace(/^[#$*]+\s*/, "").trim();
  if (name.length < 2 || name.length > 60) return null;
  if (!/[A-Za-z]/.test(name)) return null;
  if (/[:=]$/.test(name)) return null;
  // A merchant is not a product: "SAMSUNG STORE", "ACME MART", "BEST BUY
  // WHOLESALE".
  if (/\b(?:store|shop|outlet|mart|supermarket|superstore|wholesale|retail)\s*$/i.test(name)) return null;
  if (PAGE_HEADER.test(name) || nameReject(name)) return null;
  if (/\b(?:customer|store|merchant|office|original|duplicate)\s*copy\b/i.test(name)) return null;
  if (/\b(?:call|phone|tel|toll\s*free|hotline|helpline)\b/i.test(name)) return null;
  if (/\b(?:india|karnataka|bengaluru|bangalore|delhi|mumbai|california|texas|street|road|avenue|arena)\b/i.test(name)) return null;
  if (/\b\d{5,6}\b/.test(name)) return null;
  if (/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(name)) return null;
  // A "label: value" line is a field, not a product ("IMEI: 352099001761481",
  // "Model: SM-S921B"), and neither is a long digit run on its own.
  if (/^[A-Za-z]{2,12}\s*[:#]\s*\S/.test(name)) return null;
  if (/\b\d{9,}\b/.test(name)) return null;
  // An amount is not a product name ("1.299,00 EUR" on its own line).
  if (moneyTokens(name).some((token) => token.exact)) return null;
  // A line that states a month and a year is a date statement, not a product
  // ("Covered until 15 March 2028").
  if (
    /\b(?:19|20)\d{2}\b/.test(name) &&
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|until|through|thru|valid|expir|warranty)\b/i.test(name)
  ) {
    return null;
  }
  if (isNoise(name)) return null;
  return name;
}

// The trailing amount of an item row. OCR and PDF text extraction both
// collapse the column gap to a single space, so the separator cannot be
// required to be wide — the amount itself has to look like money. That is what
// separates "Refrigerator $899.99" / "1 REFRIGERATOR 899.99" (a product) from
// "CARD ****1234" (an unreadable card line).
function itemRowName(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return null;
  const tokens = moneyTokens(trimmed).filter((token) => token.exact);
  if (!tokens.length) return null;
  const last = tokens[tokens.length - 1];
  const index = trimmed.lastIndexOf(last.raw);
  if (index < 0 || index + last.raw.length < trimmed.length) return null;
  return cleanItemName(trimmed.slice(0, index));
}

// Best-effort product name from OCR text. Priority: (0) a labelled product
// name, (1) an item row — name and amount on one line, or the amount broken
// onto the next line by a PDF text layer, (2) a line mixing letters and digits
// (model-like, e.g. "WH-1000XM5"), (3) the first plausible non-noise
// alphabetic line, (4) the file name, (5) a generic fallback. OCR is noisy, so
// this only needs to be good enough to pre-fill the product form — users can
// edit the name afterwards.
function parseProductName(text, fileName, documentType) {
  const lines = splitLines(text).filter(Boolean);

  // (0) A labeled product name ("Product Name\nApexBook Pro 14" or
  // "Product: Nespresso Vertuo Next").
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const inline = line.match(/^(?:product|item)(?:\s+name)?\s*[:#-](.+)$/i);
    if (inline) {
      const named = cleanItemName(inline[1]); // cleanItemName trims the delimiter's trailing space
      if (named) return named;
    }
    if (!/\bproduct\s*name\b|\bitem\s*name\b/i.test(line)) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const named = cleanItemName(lines[j]);
      if (named) return named;
      break;
    }
  }

  // (1a) Item row: "Refrigerator   $899.99".
  for (const line of lines) {
    const named = itemRowName(line);
    if (named) return named;
  }

  // (1b) Item row split across two lines by a PDF text layer:
  // "Refrigerator" / "$899.99".
  for (let i = 0; i + 1 < lines.length; i++) {
    const amount = lines[i + 1];
    if (!MONEY_ONLY.test(amount)) continue;
    if (!moneyTokens(amount).some((token) => token.exact)) continue;
    const named = cleanItemName(lines[i]);
    if (named && !nameReject(named)) return named;
  }

  // (1d) A table whose rows the extractor split apart: after the column header
  // ("Item", "Artikel", "Qty Item Amount") the next plausible line is the item,
  // because the row's amount ends up in a separate block further down.
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!ITEM_HEADER.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length && j <= i + 4; j += 1) {
      const named = cleanItemName(lines[j]);
      if (named) return named;
    }
  }

  // (1c) A brand-labelled item ("Brand: Samsung Galaxy S24") — the value holds
  // the product and the brand prefix is split off again below. Only a value
  // with more than one word qualifies: on its own ("Brand: Samsung") it names
  // the brand, not the product, and a later line names the product properly.
  for (const line of lines) {
    const labelled = line.match(/^(?:brand|make|manufacturer)(?:\s+name)?\s*[:#-](.+)$/i);
    if (!labelled) continue;
    const named = cleanItemName(labelled[1]); // cleanItemName trims the delimiter's trailing space
    if (named && named.split(/\s+/).length >= 2) return named;
  }

  // (2) A line mixing letters and digits (model numbers, e.g. "Sony WH-1000XM5").
  for (const line of lines) {
    if (!/[a-z]/i.test(line) || !/\d/.test(line)) continue;
    if (moneyTokens(line).some((token) => token.exact)) continue;
    const named = cleanItemName(line);
    if (named) return named;
  }

  // (3) First plausible non-noise alphabetic line (1–5 words).
  for (const line of lines) {
    const named = cleanItemName(line);
    if (!named) continue;
    const words = named.split(/\s+/);
    if (words.length >= 1 && words.length <= 5) return named;
  }

  // (4) File-name fallback ("sony-wh1000xm5.pdf" → "sony wh1000xm5"), unless
  // the stem is itself a generic label ("receipt.jpg" → "receipt").
  const stem = (fileName || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (stem && stem.length >= 2 && !isNoise(stem)) return stem.slice(0, 60);

  // (5) Generic fallback.
  return documentType === "warranty_card" ? "Warranty card product" : "Receipt product";
}

function isOcrEligible(document) {
  return (
    OCR_DOCUMENT_TYPES.has(document.documentType) &&
    (OCR_IMAGE_MIME_TYPES.has(document.mimeType) || document.mimeType === OCR_PDF_MIME_TYPE)
  );
}

// Tesseract page-segmentation modes. AUTO (3) is the engine's own judgement;
// SINGLE_BLOCK (6) reads the page as one column of text, which is what a
// receipt, an invoice or a warranty card actually is — and what AUTO sometimes
// shreds into unreadable fragments when the input is a photo.
const PSM_AUTO = 3;
const PSM_SINGLE_BLOCK = 6;
const PSM_SPARSE_TEXT = 11;

let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    // tesseract.js defaults cachePath to ".", which would drop eng.traineddata
    // into the repo CWD. Cache it under the user's home instead.
    const cachePath = path.join(os.homedir(), ".cache", "warrantyvault-ocr");
    fs.mkdirSync(cachePath, { recursive: true });
    workerPromise = createWorker("eng", 1, {
      cachePath,
      // Without an errorHandler tesseract.js re-throws worker failures on the
      // event loop, which kills the whole process. A corrupt or unreadable
      // image must fail one OCR job, never the server.
      errorHandler: (error) => {
        logger.error("OCR worker error", {
          error: String((error && error.message) || error)
        });
      }
    }).catch((error) => {
      // A failed init (e.g. traineddata download error) must not poison the
      // singleton forever — reset so the next OCR call can retry.
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

// Apply the parameters every recognition needs.
//   preserve_interword_spaces keeps the column gaps a receipt printer leaves
//   between an item and its price ("Refrigerator    $899.99"); without it
//   tesseract collapses them to one space and item/price columns blur together.
async function configureWorker(worker, psm) {
  if (typeof worker.setParameters !== "function") return; // worker is mocked in tests
  await worker.setParameters({
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: String(psm)
  });
}

async function runOcr(imageBuffer, options = {}) {
  const worker = await getWorker();
  await configureWorker(worker, options.psm || PSM_AUTO);
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
      // getBounds() returns [x0, y0, x1, y1] — an array, not {x0, x1, …}. Read
      // it as one: `bounds.x1` is undefined, which used to make the scale NaN
      // and render an empty pixmap (every scanned PDF silently failed OCR).
      const [x0, y0, x1, y1] =
        typeof page.getBounds === "function" && Array.isArray(page.getBounds())
          ? page.getBounds()
          : [0, 0, PDF_RENDER_MAX_WIDTH, PDF_RENDER_MAX_WIDTH];
      const pageWidth = x1 - x0;
      const pageHeight = y1 - y0;
      // Cap by width, by height and by an absolute factor so neither a giant
      // blueprint nor a 1-point page can explode the canvas or upscale a
      // thumbnail into noise.
      const scale = Math.min(
        PDF_RENDER_MAX_WIDTH / Math.max(pageWidth, 1),
        (PDF_RENDER_MAX_WIDTH * 1.6) / Math.max(pageHeight, 1),
        PDF_RENDER_MAX_SCALE
      );
      const safeScale = Number.isFinite(scale) && scale > 0 ? scale : PDF_RENDER_MAX_SCALE;
      const pixmap = page.toPixmap(
        mupdf.Matrix.scale(safeScale, safeScale),
        mupdf.ColorSpace.DeviceRGB,
        false,
        true
      );
      const png = pixmap.asPNG();
      // asPNG() is only a view onto the WASM heap: copy it out before the next
      // mupdf allocation can detach it.
      const bytes = Buffer.from(png.asUint8Array ? png.asUint8Array() : png);
      if (bytes.length > 0) buffers.push(bytes);
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
  if (!pages.length) {
    throw new Error(
      "Could not render the scanned PDF into page images. Re-upload the original file to scan it again."
    );
  }
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

// How many distinct fields a parse produced. Used to decide whether a second
// OCR pass is worth the CPU: a pass that found nothing is worth retrying, a
// pass that found something is not.
function extractedFieldCount(parsed) {
  if (!parsed) return 0;
  return [
    parsed.warrantyExpiryDate,
    parsed.purchasePrice,
    parsed.serialNumber,
    parsed.purchaseStore,
    parsed.purchaseDate,
    parsed.brand,
    parsed.model
  ].filter((value) => value !== null && value !== undefined).length;
}

// Parse OCR text into the document's fields, including the product name the
// review-and-confirm step pre-fills. Any known brand prefix / model token is
// split out of the name so the product record gets clean brand + model fields
// (e.g. "Samsung Fridge" → brand "Samsung", name "Fridge").
function parseDocument(text, options = {}) {
  const parsed = parseDocumentText(text);
  const parts = splitProductParts(
    parseProductName(text, options.fileName, options.documentType),
    parsed.brand,
    parsed.model
  );
  parsed.productName = parts.productName;
  parsed.brand = parts.brand;
  parsed.model = parts.model;
  return parsed;
}

// Turn raw document bytes into OCR text plus the fields parsed out of it.
// This is the whole extraction pipeline minus the database bookkeeping, so it
// can be exercised directly (scripts/ocr-eval.mjs runs the real corpus through
// exactly this function) and so `processDocument` has a single source of truth
// for how a document becomes structured data.
//
// Standalone scans do not auto-create a product: the extracted data is staged
// on the document and the user reviews and corrects it
// (POST /documents/:id/confirm-product) first, so an OCR misread can never
// silently become a junk product.
async function extractDocumentData(fileBuffer, options = {}) {
  const ocrFn = options.ocrFn || runOcr;
  // pdfOcrFn is injectable for tests (mupdf is ESM-only and jest's CJS runtime
  // cannot load it); production always uses the real engine.
  const pdfOcrFn = options.pdfOcrFn || runPdfOcr;
  const isPdf = options.mimeType === OCR_PDF_MIME_TYPE;
  let text = isPdf ? await pdfOcrFn(fileBuffer, ocrFn) : await ocrFn(fileBuffer, { psm: PSM_AUTO });
  let parsed = parseDocument(text, options);

  // A photo or scan that yielded no fields at all is worth one more attempt
  // with a different page-segmentation mode — the common failure is the engine
  // splitting a receipt into blocks it then cannot read.
  if (!isPdf && extractedFieldCount(parsed) === 0) {
    const retryText = await ocrFn(fileBuffer, { psm: PSM_SINGLE_BLOCK });
    const retryParsed = parseDocument(retryText, options);
    if (extractedFieldCount(retryParsed) > 0) {
      return { text: retryText, parsed: retryParsed };
    }
  }

  // Warranty cards frequently have complex two-column or card layouts with barcodes,
  // support boxes, and stamps that confuse block segmentation. If a warranty card
  // is missing its explicit product name or key dates, sparse text recognition
  // extracts fields without artificial block boundary slicing.
  if (!isPdf && options.documentType === "warranty_card") {
    const isGeneric = (name) =>
      !name || name === "Receipt product" || name === "Warranty card product";
    const hasLabeledProduct = (txt) =>
      /\b(?:product|item)(?:\s+name)?\s*[:#-]/i.test(txt) || /\bproduct\s*name\b/i.test(txt);

    const needsSparse = isGeneric(parsed.productName) || !hasLabeledProduct(text);
    if (needsSparse) {
      try {
        const sparseText = await ocrFn(fileBuffer, { psm: PSM_SPARSE_TEXT });
        if (sparseText && sparseText.trim() && sparseText !== text) {
          const sparseParsed = parseDocument(sparseText, options);
          const currentCount = extractedFieldCount(parsed) + (isGeneric(parsed.productName) ? 0 : 1);
          const sparseCount = extractedFieldCount(sparseParsed) + (isGeneric(sparseParsed.productName) ? 0 : 1);
          if (sparseCount >= currentCount) {
            const merged = { ...parsed, ...sparseParsed };
            if (hasLabeledProduct(sparseText) && !hasLabeledProduct(text) && !isGeneric(sparseParsed.productName)) {
              merged.productName = sparseParsed.productName;
              text = sparseText;
            } else if (isGeneric(parsed.productName) && !isGeneric(sparseParsed.productName)) {
              merged.productName = sparseParsed.productName;
            } else if (!isGeneric(parsed.productName)) {
              merged.productName = parsed.productName;
            }
            if (parsed.purchaseStore && !/^[^\w\s]/.test(parsed.purchaseStore)) {
              merged.purchaseStore = parsed.purchaseStore;
            }
            parsed = merged;
          }
        }
      } catch {
        // Fall back to primary parse
      }
    }
  }

  return { text, parsed };
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
    // Prefer the original upload buffer when available (avoids a delivery
    // round-trip that can be blocked by the Cloudinary account's media
    // delivery ACL); fall back to fetching the stored file (e.g. retries).
    let fileBuffer = options.fileBuffer;
    if (!fileBuffer) {
      fileBuffer = await fetchStoredFileBytes(document);
    }
    const { text, parsed } = await extractDocumentData(fileBuffer, {
      mimeType: document.mimeType,
      fileName: document.fileName,
      documentType: document.documentType,
      ocrFn: options.ocrFn,
      pdfOcrFn: options.pdfOcrFn
    });

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
  extractDocumentData,
  parseDocument,
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
  parseWarrantyMonths,
  parseAmountToken,
  splitProductParts,
  processDocument,
  fetchStoredFileBytes,
  isOcrEligible,
  getOcrMetrics,
  OCR_DOCUMENT_TYPES,
  OCR_IMAGE_MIME_TYPES,
  OCR_PDF_MIME_TYPE
};

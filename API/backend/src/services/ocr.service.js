const { createWorker } = require("tesseract.js");
const Document = require("../models/Document");
const { applyOcrToProduct } = require("./product.service");

const OCR_DOCUMENT_TYPES = new Set(["receipt", "warranty_card"]);
const OCR_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function parseDate(text) {
  if (!text) return null;
  const keywordPattern =
    /(expiry|expiration|expires|valid thru|valid through|warranty|good until|exp)[^0-9]{0,20}([0-9]{1,2}[/\-.][0-9]{1,2}[/\-.][0-9]{2,4})/i;
  const match = text.match(keywordPattern);
  const candidate = match ? match[2] : null;
  const fallback = (text.match(/([0-9]{1,2}[/\-.][0-9]{1,2}[/\-.][0-9]{2,4})/) || [])[1];
  const raw = candidate || fallback;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePrice(text) {
  if (!text) return null;

  const PRICE_PATTERN = /\$\s?([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)/;
  const TOTAL_PATTERN = /(?:\b(?:grand\s*)?total\b)|(?:\bamount(?:\s*due)?\b)|\bdue\b|\bbal\b/i;

  const toValue = (raw) => {
    const value = parseFloat(raw.replace(/,/g, ""));
    return Number.isNaN(value) ? null : value;
  };

  for (const line of text.split(/\r?\n/)) {
    if (TOTAL_PATTERN.test(line)) {
      const match = line.match(PRICE_PATTERN);
      if (match) return toValue(match[1]);
    }
  }

  const match = text.match(PRICE_PATTERN);
  return match ? toValue(match[1]) : null;
}

function parseSerial(text) {
  if (!text) return null;
  const match = text.match(
    /(?:serial\s*(?:no\.?|number|#)?|s\/?n\.?|sn\.?)[\s:]*([A-Z0-9][A-Z0-9-]{3,})/i
  );
  return match ? match[1].toUpperCase() : null;
}

function parseDocumentText(text) {
  return {
    warrantyExpiryDate: parseDate(text),
    purchasePrice: parsePrice(text),
    serialNumber: parseSerial(text)
  };
}

function isOcrEligible(document) {
  return (
    OCR_DOCUMENT_TYPES.has(document.documentType) &&
    OCR_IMAGE_MIME_TYPES.has(document.mimeType)
  );
}

let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("eng");
  }
  return workerPromise;
}

async function runOcr(imageBuffer) {
  const worker = await getWorker();
  const { data } = await worker.recognize(imageBuffer);
  return data.text;
}

async function processDocument(document, options = {}) {
  document.ocrStatus = "processing";
  await document.save();

  try {
    const ocrFn = options.ocrFn || runOcr;
    const response = await fetch(document.fileUrl);
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const text = await ocrFn(imageBuffer);
    const parsed = parseDocumentText(text);

    document.ocrText = text;
    document.parsedData = parsed;
    document.ocrStatus = "done";
    await document.save();

    await applyOcrToProduct(document.productId, parsed);
    return document;
  } catch (error) {
    document.ocrStatus = "failed";
    document.ocrError = error.message;
    await document.save();
    return document;
  }
}

module.exports = {
  runOcr,
  parseDocumentText,
  processDocument,
  isOcrEligible,
  OCR_DOCUMENT_TYPES,
  OCR_IMAGE_MIME_TYPES
};

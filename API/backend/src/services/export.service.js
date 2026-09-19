// Phase 4 §15/§16 — warranty claim preparation + structured export/import.
//
// All features are strictly user-scoped: everything is looked up with the
// authenticated userId, so one user can never export, claim or import into
// another user's data. Exports include product and service metadata — never
// private file contents.
"use strict";

const zlib = require("node:zlib");
const Product = require("../models/Product");
const ServiceHistory = require("../models/ServiceHistory");
const Document = require("../models/Document");
const AppError = require("../utils/AppError");
const { primaryWarrantyStatus } = require("./warranty.service");

function toDateString(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Column names used by the CSV/ODS export AND accepted by the CSV import.
const CSV_HEADERS = [
  "productName", "brand", "model", "category", "serialNumber", "purchaseDate",
  "purchasePrice", "currency", "purchaseStore",
  "warrantyExpiryDate", "lifecycleStatus", "serviceHistory"
];

// Friendly header labels for the ODS spreadsheet layout.
const ODS_HEADERS = [
  "Product Name", "Brand", "Model", "Category", "Serial Number", "Purchase Date",
  "Purchase Price", "Currency", "Purchase Store",
  "Warranty Expiry Date", "Lifecycle Status", "Service History"
];

const LIFECYCLE_STATUSES = [
  "owned", "in_use", "stored", "under_repair", "sold", "gifted", "disposed"
];

// ─── Claim summary (§15) ─────────────────────────────────────────────────────

// A claim-ready snapshot of one product: everything a user needs to open a
// warranty claim — including the warranty provider's contact details and the
// metadata of supporting documents — plus the service records. No file
// contents or auth internals are included.
//
// NOTE: this is deliberately richer than the bulk export. The export column
// set is intentionally narrow (see CSV_HEADERS), while a claim snapshot must
// keep every field the claim UI and the documented ClaimSummary schema use.
async function getClaimSummary(productId, userId) {
  const product = await Product.findById(productId);
  if (!product || product.isDeleted) {
    throw new AppError("Product not found", 404);
  }
  if (String(product.userId) !== String(userId)) {
    throw new AppError("Product does not belong to authenticated user", 403);
  }

  const [serviceHistory, documents] = await Promise.all([
    ServiceHistory.find({ productId: product._id, userId })
      .select("serviceDate serviceType serviceProvider cost currency description nextServiceDate")
      .sort({ serviceDate: -1 })
      .lean(),
    Document.find({ productId: product._id, userId })
      .select("fileName documentType fileSize uploadedAt ocrStatus")
      .sort({ uploadedAt: -1 })
      .lean()
  ]);

  const status = primaryWarrantyStatus(product);

  return {
    productId: product._id,
    productName: product.productName,
    brand: product.brand || null,
    model: product.model || null,
    serialNumber: product.serialNumber || null,
    category: product.category || null,
    purchaseDate: toDateString(product.purchaseDate),
    purchasePrice: product.purchasePrice ?? null,
    currency: product.currency || null,
    purchaseStore: product.purchaseStore || null,
    warrantyProvider: product.warrantyProvider || null,
    warrantyProviderType: product.warrantyProviderType || null,
    warrantyContact: product.warrantyContact || null,
    warrantyExpiryDate: toDateString(product.warrantyExpiryDate),
    warrantyStatus: status.status,
    warrantyStatusLabel: status.label,
    lifecycleStatus: product.lifecycleStatus || "owned",
    tags: product.tags || [],
    notes: product.notes || null,
    warranties: (product.warranties || []).map((w) => ({
      type: w.type || null,
      provider: w.provider || null,
      coverage: w.coverage || null,
      startDate: toDateString(w.startDate),
      expiryDate: toDateString(w.expiryDate),
      status: w.status || "unknown"
    })),
    documents: documents.map((d) => ({
      fileName: d.fileName,
      documentType: d.documentType,
      fileSize: d.fileSize,
      uploadedAt: d.uploadedAt,
      ocrStatus: d.ocrStatus
    })),
    serviceHistory: serviceHistory.map((r) => ({
      serviceDate: toDateString(r.serviceDate),
      serviceType: r.serviceType,
      serviceProvider: r.serviceProvider || null,
      cost: r.cost ?? null,
      currency: r.currency || null,
      description: r.description || null,
      nextServiceDate: toDateString(r.nextServiceDate)
    }))
  };
}

// ─── CSV / JSON export ───────────────────────────────────────────────────────

// Flatten one product into a single export row (for CSV/ODS).
function productToCsvRow(p, serviceByProduct) {
  const services = (serviceByProduct.get(String(p._id)) || []).map((r) =>
    [toDateString(r.serviceDate), r.serviceType, r.serviceProvider, r.cost, toDateString(r.nextServiceDate)]
      .filter(Boolean)
      .join(" | ")
  );
  return {
    productName: p.productName,
    brand: p.brand || "",
    model: p.model || "",
    category: p.category || "",
    serialNumber: p.serialNumber || "",
    purchaseDate: toDateString(p.purchaseDate) || "",
    purchasePrice: p.purchasePrice ?? "",
    currency: p.currency || "",
    purchaseStore: p.purchaseStore || "",
    warrantyExpiryDate: toDateString(p.warrantyExpiryDate) || "",
    lifecycleStatus: p.lifecycleStatus || "owned",
    serviceHistory: services.join(" ;; ")
  };
}

function csvEscape(value) {
  let s = String(value == null ? "" : value);
  // CSV formula injection guard: a cell beginning with =, +, -, @ or tab is
  // interpreted as a formula by Excel/Sheets (e.g. =HYPERLINK(...) or @cmd).
  // Neutralize it with a leading apostrophe. Safe here because prices are
  // min 0 and dates start with digits, so no legitimate value is harmed.
  if (/^[=+\-@\t]/.test(s)) {
    s = "'" + s;
  }
  // RFC 4180: quote when the value contains a comma, quote or newline;
  // double any embedded quotes.
  if (/[\",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// One flattened row per product as a CSV document (headers + rows, no BOM).
// `headers` defaults to the product export columns and is overridable for
// standalone use.
function toCsv(rows, headers = CSV_HEADERS) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n");
}

// ─── ODS (OpenDocument Spreadsheet) export ──────────────────────────────────
// OpenDocument packages a ZIP with content.xml + manifest. We build a minimal,
// spec-compliant package — no heavyweight dependency — that Excel, LibreOffice
// and Google Sheets all open as a spreadsheet.

const ODS_CONTENT_XML_OPEN = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
 xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
 xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
 xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
 office:version="1.3">
 <office:automatic-styles>
  <style:style style:name="boldHeader" style:family="table-cell">
   <style:text-properties fo:font-weight="bold"/>
  </style:style>
 </office:automatic-styles>
 <office:body>
  <office:spreadsheet>
   <table:table table:name="Products">
`;

const ODS_CONTENT_XML_CLOSE = `   </table:table>
  </office:spreadsheet>
 </office:body>
</office:document-content>
`;

function odsEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Emit a single ODS table cell. Numbers are stored as float cells so
// spreadsheets treat prices numerically; everything else is a string cell.
function odsCell(value, styleName) {
  const styleAttr = styleName ? ` table:style-name="${styleName}"` : "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<table:table-cell${styleAttr} office:value-type="float" office:value="${value}"><text:p>${odsEscape(value)}</text:p></table:table-cell>`;
  }
  const text = value == null ? "" : String(value);
  return `<table:table-cell${styleAttr} office:value-type="string"><text:p>${odsEscape(text)}</text:p></table:table-cell>`;
}

function odsRow(cells, isHeader) {
  const cellsXml = cells.map((c) => odsCell(c, isHeader ? "boldHeader" : null)).join("");
  return "    <table:table-row>" + cellsXml + "</table:table-row>\n";
}

// Minimal ZIP writer: local file headers + central directory, entries
// DEFLATE-compressed, CRC-32 per spec. Enough for a valid ODF package.
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function dosDateTime(d) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

function buildZip(entries) {
  const now = dosDateTime(new Date());
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const compressed = zlib.deflateRawSync(data, { level: 9 });

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // DEFLATE
    local.writeUInt16LE(now.time, 10);
    local.writeUInt16LE(now.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(now.time, 12);
    central.writeUInt16LE(now.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);

    localParts.push(local, nameBuf, compressed);
    centralParts.push(central, nameBuf);
    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, centralDir, end]);
}

// Build the complete ODS package for the given rows.
function buildOds(rows) {
  const contentXml =
    ODS_CONTENT_XML_OPEN +
    odsRow(ODS_HEADERS, true) +
    rows.map((r) => odsRow(CSV_HEADERS.map((h) => r[h]))).join("") +
    ODS_CONTENT_XML_CLOSE;

  const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
 <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>
 <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
 <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
 <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
 <manifest:file-entry manifest:full-path="mimetype" manifest:media-type="text/plain"/>
</manifest:manifest>
`;

  const metaXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.3">
 <office:meta>
  <meta:generator>WarrantyVault</meta:generator>
 </office:meta>
</office:document-meta>
`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.3">
 <office:styles/>
</office:document-styles>
`;

  const mimetype = "application/vnd.oasis.opendocument.spreadsheet";

  return buildZip([
    { name: "mimetype", data: Buffer.from(mimetype, "utf8") },
    { name: "META-INF/manifest.xml", data: Buffer.from(manifestXml, "utf8") },
    { name: "content.xml", data: Buffer.from(contentXml, "utf8") },
    { name: "meta.xml", data: Buffer.from(metaXml, "utf8") },
    { name: "styles.xml", data: Buffer.from(stylesXml, "utf8") }
  ]);
}

// ─── Unified export entry point ──────────────────────────────────────────────

// Export every live product the user owns. format: "json" (default), "csv"
// or "ods". All user-scoped.
async function exportProducts(userId, format = "json") {
  const products = await Product.find({ userId, isDeleted: false })
    .sort({ createdAt: 1 })
    .lean();

  const productIds = products.map((p) => p._id);
  const services = await ServiceHistory.find({ userId, productId: { $in: productIds } })
    .select("productId serviceDate serviceType serviceProvider cost currency description nextServiceDate")
    .lean();

  const serviceByProduct = new Map();
  for (const r of services) {
    const key = String(r.productId);
    if (!serviceByProduct.has(key)) serviceByProduct.set(key, []);
    serviceByProduct.get(key).push(r);
  }

  const fmt = String(format).toLowerCase();

  if (fmt === "csv") {
    return {
      mimeType: "text/csv; charset=utf-8",
      extension: "csv",
      body: toCsv(products.map((p) => productToCsvRow(p, serviceByProduct)))
    };
  }

  if (fmt === "ods") {
    return {
      mimeType: "application/vnd.oasis.opendocument.spreadsheet",
      extension: "ods",
      body: buildOds(products.map((p) => productToCsvRow(p, serviceByProduct)))
    };
  }

  // Whitelist exported product fields — never spread the raw document, which
  // would leak internals (userId, isDeleted, __v) into the download.
  const exportRow = (p) => ({
    _id: p._id,
    productName: p.productName,
    brand: p.brand || null,
    model: p.model || null,
    category: p.category || null,
    serialNumber: p.serialNumber || null,
    purchaseDate: toDateString(p.purchaseDate),
    purchasePrice: p.purchasePrice ?? null,
    currency: p.currency || null,
    purchaseStore: p.purchaseStore || null,
    warrantyExpiryDate: toDateString(p.warrantyExpiryDate),
    warrantyPeriodMonths: p.warrantyPeriodMonths ?? null,
    lifecycleStatus: p.lifecycleStatus || "owned",
    serviceHistory: (serviceByProduct.get(String(p._id)) || []).map((r) => ({
      serviceDate: toDateString(r.serviceDate),
      serviceType: r.serviceType,
      serviceProvider: r.serviceProvider || null,
      cost: r.cost ?? null,
      currency: r.currency || null,
      description: r.description || null,
      nextServiceDate: toDateString(r.nextServiceDate)
    })),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  });

  return {
    mimeType: "application/json; charset=utf-8",
    extension: "json",
    body: JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        count: products.length,
        products: products.map(exportRow)
      },
      null,
      2
    )
  };
}

// ─── Import (CSV / JSON) ─────────────────────────────────────────────────────
// Bulk-creates products for the authenticated user. Duplicate serials (per
// user, among live products) are reported, not imported — the unique partial
// index { userId, serialNumber } backs this up at the DB level.

function parseDateOrNull(s) {
  if (s == null || s === "") return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeLifecycle(v) {
  return LIFECYCLE_STATUSES.includes(v) ? v : "owned";
}

// Parse a CSV file (headers + rows) into objects keyed by header.
// RFC 4180: quoted fields may contain commas/quotes/newlines; "" escapes a
// quote. A leading apostrophe (our export's formula guard) is stripped.
function parseCsv(text) {
  const s = String(text).replace(/^\uFEFF/, "");
  const records = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") records.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  // Final record (no trailing newline).
  row.push(field);
  if (row.length > 1 || row[0] !== "") records.push(row);

  if (!records.length) return [];
  const headers = records[0].map((h) => h.trim());
  return records.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, idx) => {
      let v = cells[idx] == null ? "" : cells[idx];
      if (v.startsWith("'")) v = v.slice(1); // undo the formula-injection guard
      obj[h] = v;
    });
    return obj;
  });
}

// Map one imported record (from CSV or JSON) onto the Product schema. Returns
// { doc, errors, warnings } — `doc` is null when the record is unusable.
function recordToProductDoc(rec) {
  const errors = [];
  const warnings = [];

  const get = (k) => (rec[k] == null ? "" : String(rec[k]).trim());

  const productName = get("productName");
  if (!productName) {
    errors.push("productName is required");
  }

  const priceRaw = get("purchasePrice");
  let purchasePrice;
  if (priceRaw !== "") {
    purchasePrice = Number(priceRaw);
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
      errors.push("purchasePrice must be a number ≥ 0");
    }
  }

  const expiryRaw = get("warrantyExpiryDate");
  let warrantyExpiryDate = null;
  if (expiryRaw) {
    warrantyExpiryDate = parseDateOrNull(expiryRaw);
    if (!warrantyExpiryDate) errors.push(`warrantyExpiryDate "${expiryRaw}" is not a valid date`);
  }

  const purchaseDate = parseDateOrNull(get("purchaseDate"));

  const lifecycleStatus = normalizeLifecycle(get("lifecycleStatus"));
  if (get("lifecycleStatus") && lifecycleStatus !== get("lifecycleStatus")) {
    warnings.push(`unknown lifecycleStatus "${get("lifecycleStatus")}" → "owned"`);
  }

  if (errors.length) return { doc: null, errors, warnings };

  const doc = {
    productName,
    brand: get("brand") || undefined,
    model: get("model") || undefined,
    category: get("category") || undefined,
    serialNumber: get("serialNumber") || undefined,
    purchaseDate,
    purchasePrice,
    currency: get("currency") || undefined,
    purchaseStore: get("purchaseStore") || undefined,
    warrantyExpiryDate,
    lifecycleStatus
  };
  return { doc, errors, warnings };
}

// Import products from a CSV or JSON upload for the authenticated user.
// Returns a per-row report: imported / failed / duplicate counts + messages.
async function importProducts(userId, file) {
  if (!file || !file.buffer || !file.buffer.length) {
    throw new AppError("Import file is required", 400);
  }

  const mimetype = String(file.mimetype || "").toLowerCase();
  const name = String(file.originalname || "").toLowerCase();
  let records;

  if (mimetype.includes("json") || name.endsWith(".json")) {
    let parsed;
    try {
      parsed = JSON.parse(file.buffer.toString("utf8"));
    } catch {
      throw new AppError("Invalid JSON file", 400);
    }
    // Accept either { products: [...] }, a bare array, or one product object.
    let list;
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (Array.isArray(parsed.products)) {
      list = parsed.products;
    } else {
      list = [parsed];
    }
    records = list.filter((r) => r && typeof r === "object" && !Array.isArray(r));
  } else if (mimetype.includes("csv") || name.endsWith(".csv") || mimetype === "text/plain") {
    records = parseCsv(file.buffer.toString("utf8"));
  } else {
    throw new AppError("Unsupported import format — upload a CSV or JSON file", 400);
  }

  if (!records.length) {
    throw new AppError("No product rows found in the import file", 400);
  }
  if (records.length > 500) {
    throw new AppError("Too many rows — import at most 500 products per file", 400);
  }

  // Serial dedup: within the file first, then against the user's live
  // products (mirrors the DB partial unique index).
  const existing = await Product.find({ userId, isDeleted: false, serialNumber: { $type: "string" } })
    .select("serialNumber")
    .lean();
  const takenSerials = new Set(existing.map((p) => p.serialNumber));

  const results = [];
  const seenSerials = new Set();

  for (let i = 0; i < records.length; i++) {
    const { doc, errors, warnings } = recordToProductDoc(records[i]);
    if (!doc) {
      results.push({ row: i + 1, status: "failed", errors, warnings });
      continue;
    }
    if (doc.serialNumber) {
      if (seenSerials.has(doc.serialNumber) || takenSerials.has(doc.serialNumber)) {
        results.push({ row: i + 1, status: "duplicate", productName: doc.productName, errors: [`serial number "${doc.serialNumber}" already exists`] });
        continue;
      }
      seenSerials.add(doc.serialNumber);
    }
    try {
      const created = await Product.create({ ...doc, userId });
      results.push({ row: i + 1, status: "imported", productId: created._id, productName: created.productName, warnings });
    } catch (error) {
      // Duplicate-key race or validation failure: report instead of failing
      // the whole import (partial imports are intentional).
      const message = error.code === 11000 ? "duplicate serial number" : error.message || "database error";
      results.push({ row: i + 1, status: error.code === 11000 ? "duplicate" : "failed", productName: doc.productName, errors: [message] });
    }
  }

  const imported = results.filter((r) => r.status === "imported").length;
  return {
    totalRows: records.length,
    imported,
    failed: results.filter((r) => r.status === "failed").length,
    duplicates: results.filter((r) => r.status === "duplicate").length,
    results
  };
}

module.exports = {
  getClaimSummary,
  exportProducts,
  importProducts,
  toCsv,
  csvEscape,
  parseCsv,
  recordToProductDoc,
  CSV_HEADERS,
  ODS_HEADERS,
  buildOds,
  toDateString
};

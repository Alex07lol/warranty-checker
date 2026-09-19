"use strict";

/**
 * Default field mapping dictionary.
 * Maps normalized external headers to WarrantyVault Product schema field names.
 */
const DEFAULT_FIELD_MAP = {
  name: "productName",
  "product name": "productName",
  "product title": "productName",
  "item name": "productName",
  item: "productName",
  product: "productName",
  title: "productName",

  manufacturer: "brand",
  brand: "brand",
  make: "brand",
  company: "brand",

  "model no": "model",
  "model no.": "model",
  "model number": "model",
  model: "model",
  "item model": "model",

  "purchase date": "purchaseDate",
  "bought on": "purchaseDate",
  "date of purchase": "purchaseDate",
  "invoice date": "purchaseDate",
  "order date": "purchaseDate",
  purchased: "purchaseDate",

  cost: "purchasePrice",
  price: "purchasePrice",
  "purchase price": "purchasePrice",
  amount: "purchasePrice",
  total: "purchasePrice",

  shop: "purchaseStore",
  store: "purchaseStore",
  "purchase store": "purchaseStore",
  retailer: "purchaseStore",
  vendor: "purchaseStore",
  seller: "purchaseStore",

  "s/n": "serialNumber",
  "serial no": "serialNumber",
  "serial no.": "serialNumber",
  "serial number": "serialNumber",
  serial: "serialNumber",
  sn: "serialNumber",

  "warranty end": "warrantyExpiryDate",
  "warranty end date": "warrantyExpiryDate",
  "warranty expiry": "warrantyExpiryDate",
  "warranty expiry date": "warrantyExpiryDate",
  "warranty valid till": "warrantyExpiryDate",
  "expiry date": "warrantyExpiryDate",
  expiry: "warrantyExpiryDate",

  "warranty period": "warrantyPeriodMonths",
  "warranty period months": "warrantyPeriodMonths",
  "warranty months": "warrantyPeriodMonths",
  "warranty duration": "warrantyPeriodMonths",

  "warranty provider": "warrantyProvider",
  provider: "warrantyProvider",

  "warranty type": "warrantyProviderType",
  "warranty provider type": "warrantyProviderType",
  "provider type": "warrantyProviderType",

  "warranty contact": "warrantyContact",
  "warranty support": "warrantyContact",
  "support contact": "warrantyContact",

  "warranty website": "warrantyWebsite",
  "support url": "warrantyWebsite",
  "support website": "warrantyWebsite",

  type: "category",
  category: "category",
  "product type": "category",

  tags: "tags",
  labels: "tags",

  notes: "notes",
  description: "notes",
  remarks: "notes",
  comments: "notes",

  currency: "currency",

  "lifecycle status": "lifecycleStatus",
  status: "lifecycleStatus"
};

/**
 * Normalizes header string:
 * lowercase, trim, replace underscores/hyphens/dots with spaces, collapse spaces.
 */
function normalizeHeaderName(header) {
  if (!header || typeof header !== "string") return "";
  return header
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Maps a single raw record object to WarrantyVault Product fields.
 *
 * @param {Object} rawRecord - e.g. { "Name": "Samsung Refrigerator", "Cost": "89999" }
 * @param {Object} [customMapping={}] - optional overrides
 * @returns {Object} mappedRecord
 */
function mapRecord(rawRecord, customMapping = {}) {
  const mapped = {};
  if (!rawRecord || typeof rawRecord !== "object") {
    return mapped;
  }

  // Merge custom mapping with default
  const fieldMap = { ...DEFAULT_FIELD_MAP };
  for (const [key, val] of Object.entries(customMapping)) {
    fieldMap[normalizeHeaderName(key)] = val;
  }

  for (const [rawKey, rawValue] of Object.entries(rawRecord)) {
    const normalizedKey = normalizeHeaderName(rawKey);
    const targetField = fieldMap[normalizedKey] || rawKey;

    // Only assign if not undefined
    if (rawValue !== undefined) {
      mapped[targetField] = rawValue;
    }
  }

  return mapped;
}

module.exports = {
  DEFAULT_FIELD_MAP,
  normalizeHeaderName,
  mapRecord
};

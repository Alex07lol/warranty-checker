# WarrantyVault Data Migration Module

## 1. Overview

The **Data Migration Module** enables users to import external product and warranty records into WarrantyVault from diverse formats (such as CSV and JSON). It handles records with missing details, altered column naming, duplicate entries, and malformed data.

The module provides an auditable, deterministic transformation pipeline that preserves the original raw inputs and generates verifiable before-and-after evidence.

Every incoming record results in exactly one final outcome:
* **`imported`**: Record passed validation and duplicate checks; a live MongoDB `Product` document was created.
* **`rejected`**: Record violated mandatory validation or business rules (reasons recorded).
* **`duplicate`**: Record was valid but matched another record in the same batch or an existing product in the database.

---

## 2. Architecture & Pipeline Flow

The migration pipeline follows the controller → service → model architecture:

```
[ External CSV / JSON ]
           │
           ▼
   [ 1. CSV/JSON Parser ]  ──> Preserves rawRecord, 1-indexed sourceRowNumber
           │
           ▼
    [ 2. Field Mapper ]    ──> Maps heterogeneous headers to Product schema
           │
           ▼
    [ 3. Normalizer ]      ──> Cleans strings, extracts currencies, parses dates
           │
           ▼
    [ 4. Joi Validator ]   ──> Distinguishes fatal errors from advisory warnings
           │
           ▼
  [ 5. Duplicate Check ]   ──> Detects intra-batch and database duplicates
           │
           ▼
    [ 6. Migration Doc ]   ──> Stores immutable audit log in status "preview"
           │
           ▼
    [ 7. Import Action ]   ──> Invokes product.service.createProduct()
           │
           ▼
  [ 8. Accuracy Verifier ] ──> Field-by-field verification against resulting Product
```

### Module File Layout

```text
API/backend/src/
├── controllers/
│   └── migration.controller.js
├── middleware/
│   └── migrationUpload.js
├── models/
│   └── Migration.js
├── routes/
│   └── migration.routes.js
├── services/
│   └── migration.service.js
├── utils/
│   └── migration/
│       ├── accuracy.js
│       ├── csvParser.js
│       ├── duplicateDetector.js
│       ├── fieldMapper.js
│       └── normalizer.js
└── validators/
    └── migration.validator.js
```

---

## 3. Supported Source Formats

### CSV (RFC 4180 Compliant)
The parser does not use naive `split(",")`. It implements a deterministic finite-state scanner supporting:
* Quoted fields with embedded commas (`"Samsung, Inc."`)
* Escaped double-quotes (`"Model ""X"""`)
* Embedded newlines inside quoted strings
* Blank lines and arbitrary whitespace
* UTF-8 with optional Byte Order Mark (BOM) stripping
* 1-indexed row tracking (Row 1 = headers, Row 2+ = data rows)

### JSON Format
Accepts JSON arrays of objects (`[{ "Name": "...", "Cost": "..." }]`).

---

## 4. Field Mapping Rules

The mapper standardizes external column names by lowercasing, replacing punctuation (`_`, `-`, `.`) with spaces, and trimming.

### Default Mapping Dictionary

| External Header Variation | Target Product Field |
|---|---|
| `Name`, `Product Name`, `Item Name`, `Item`, `Title` | `productName` |
| `Manufacturer`, `Brand`, `Make`, `Company` | `brand` |
| `Model No`, `Model No.`, `Model Number`, `Model` | `model` |
| `Purchase Date`, `Bought On`, `Date of Purchase`, `Order Date` | `purchaseDate` |
| `Cost`, `Price`, `Purchase Price`, `Amount`, `Total` | `purchasePrice` |
| `Shop`, `Store`, `Purchase Store`, `Retailer`, `Vendor` | `purchaseStore` |
| `S/N`, `Serial No`, `Serial No.`, `Serial Number`, `Serial` | `serialNumber` |
| `Warranty End`, `Warranty End Date`, `Warranty Expiry`, `Expiry Date` | `warrantyExpiryDate` |
| `Warranty Period`, `Warranty Months`, `Warranty Duration` | `warrantyPeriodMonths` |
| `Warranty Provider`, `Provider` | `warrantyProvider` |
| `Warranty Type`, `Provider Type` | `warrantyProviderType` |
| `Warranty Contact`, `Support Contact` | `warrantyContact` |
| `Warranty Website`, `Support Website` | `warrantyWebsite` |
| `Type`, `Category`, `Product Type` | `category` |
| `Tags`, `Labels` | `tags` |
| `Notes`, `Description`, `Remarks` | `notes` |
| `Currency` | `currency` |
| `Lifecycle Status`, `Status` | `lifecycleStatus` |

---

## 5. Normalization Rules

1. **Strings**:
   * Whitespace trimmed.
   * Empty strings converted to `undefined`.
   * User-facing proper nouns (`productName`, `brand`, `model`, `purchaseStore`) preserve their original casing.
2. **Currency & Price**:
   * Extracts currency symbols from price strings:
     * `₹`, `Rs.`, `INR` → `currency: "INR"`
     * `$`, `USD` → `currency: "USD"`
     * `€`, `EUR` → `currency: "EUR"`
     * `£`, `GBP` → `currency: "GBP"`
   * Strips thousand-separator commas (`89,999` → `89999`).
   * Parses to numeric float. Retains `NaN` if unparseable so validation catches it.
   * Never invents an arbitrary currency when none can be determined.
3. **Tags**:
   * Splits string tags on `,` or `;`.
   * Trims, lowercases, drops blanks, deduplicates, and caps at 20 items.
4. **Dates**:
   * Supports ISO (`YYYY-MM-DD`), textual months (`10 May 2025`, `May 10, 2025`), and slash notation (`DD/MM/YYYY`, `MM/DD/YYYY`).
   * Ambiguous date resolution: If both numeric parts are $\le 12$ (e.g., `05/10/2025`), it defaults to `DD/MM/YYYY` and records an explicit non-fatal warning in the audit log.
   * Unparseable dates produce an invalid Date sentinel that is caught by validation.

---

## 6. Validation & Cross-Field Rules

### Fatal Validation Errors (`outcome = rejected`)
* Missing or empty `productName`
* Negative `purchasePrice` ($< 0$)
* Unparseable `purchaseDate` or `warrantyExpiryDate`
* Future `purchaseDate` ($> \text{today}$)
* Inconsistent warranty timeline: `warrantyExpiryDate <= purchaseDate`
* Invalid `lifecycleStatus` (must match schema enum)
* Invalid `warrantyProviderType` (must match schema enum)

### Non-Fatal Warnings (Preserved as `valid`)
* Missing `brand`
* Missing `model`
* Missing `purchaseStore`
* Missing `warrantyExpiryDate`
* Ambiguous numeric date interpretation

---

## 7. Duplicate Detection Rules

Duplicates are detected at two levels:

1. **Intra-Batch Duplicates**:
   * **Strong**: Identical `serialNumber` (case-insensitive, trimmed).
   * **Weaker**: Same `brand` + `model` + `purchaseStore` and purchase dates within 90 days.
   * The earlier row in the batch is preserved; subsequent rows are flagged as duplicates referencing the earlier row number.
2. **Database Duplicates**:
   * Checks the user's existing active products (`userId`, `isDeleted: false`).
   * Identical `serialNumber` or identical `brand` + `model` + `store` within 90 days flags the incoming record as a duplicate referencing the existing Product ID.

### Concurrency Race Condition Handling
If another concurrent process creates the same serial number between preview and import, the database unique index `{ userId: 1, serialNumber: 1 }` throws an `E11000` error. The migration service catches this error, changes the record's outcome to `duplicate`, updates metrics, and continues without crashing.

---

## 8. Exact Audit Metric Formulas

### Import Success Rate
Measures the percentage of valid records that successfully made it into the database:

$$\text{Import Success Rate} = \frac{\text{Successfully Imported Valid Records}}{\text{Total Valid Records}} \times 100$$

*Example from Benchmark Scenario:*
* Total Records: 10
* Valid Records: 8
* Imported Records: 6
* Rejected Records: 2
* Duplicate Records: 2
$$\text{Import Success Rate} = \frac{6}{8} \times 100 = 75.00\%$$

### Data Accuracy
Measures field-level conversion fidelity across all deterministic fields:

$$\text{Data Accuracy} = \frac{\text{Correctly Imported Expected Fields}}{\text{Total Expected Fields across Imported Records}} \times 100$$

Each imported record compares normalized source values against the live MongoDB document for:
`productName`, `brand`, `model`, `category`, `purchaseDate`, `purchasePrice`, `currency`, `purchaseStore`, `serialNumber`, `warrantyExpiryDate`, `warrantyPeriodMonths`, `warrantyProvider`, `warrantyProviderType`, `lifecycleStatus`, `tags`, and `notes`.

---

## 9. Sample Benchmark Dataset (`migration-demo.csv`)

```csv
Name,Manufacturer,Model No,Purchase Date,Cost,Shop,S/N,Warranty End,Type,Tags
Samsung Refrigerator,Samsung,RF28A,12/03/2025,₹89999,Croma,SN1001,12/03/2028,Appliance,Home;Kitchen
Sony WH-1000XM5,Sony,WH-1000XM5,2025-05-10,29999,Amazon,SN1002,2027-05-10,Audio,Personal
Dell Laptop,Dell,Latitude 5420,,55000,Amazon,SN1003,2027-09-01,Computer,Work
Samsung Refrigerator,Samsung,RF28A,12/03/2025,89999,Croma,SN1001,12/03/2028,Appliance,Home;Kitchen
Broken Record,,MODEL-X,not-a-date,-200,,SN1005,invalid-date,,
Apple iPad Air,Apple,iPad Air M2,2025-03-01,$599,Apple Store,SN1006,2026-03-01,Tablet,Personal;Work
LG OLED TV,LG,OLED65C3,2024-11-20,Rs. 120000,Reliance Digital,SN1007,2026-11-20,Television,Living Room;Entertainment
,Anker,737 Power Bank,2025-02-10,9999,Amazon,SN1008,2026-02-10,Accessory,Travel
Bose QuietComfort 45,Bose,QC45,2025-04-12,24999,Croma,SN1009,2026-04-12,Audio,Travel;Music
Apple iPad Air,Apple,iPad Air M2,2025-03-01,599,Apple Store,SN1006,2026-03-01,Tablet,Personal;Work
```

---

## 10. API Endpoints

All endpoints require `Authorization: Bearer <token>`.

* `POST /api/v1/migrations/preview`: Staged preview from file upload (`multipart/form-data`) or body.
* `POST /api/v1/migrations/:id/import`: Executes import for valid records from a preview.
* `POST /api/v1/migrations`: Single-step direct upload and import.
* `GET /api/v1/migrations`: Paginated history of user's past migrations.
* `GET /api/v1/migrations/:id`: Complete migration record detail.
* `GET /api/v1/migrations/:id/evidence`: Detailed before-and-after audit evidence.

---

## 11. Verification & Test Commands

```bash
# Run migration unit & integration test suite
npm test tests/migration.test.js

# Run full repository test suite
npm test

# Run ESLint + SonarJS rules
npm run lint

# Run automated demo verification script
npm run migration:demo
```

"use strict";

const { app, request, startDb, stopDb, registerUser } = require("./helpers/setup");
const Product = require("../src/models/Product");
const Migration = require("../src/models/Migration");
const { parseCsv } = require("../src/utils/migration/csvParser");
const { mapRecord } = require("../src/utils/migration/fieldMapper");
const { normalizeRecord } = require("../src/utils/migration/normalizer");
const { validateMigrationRecord } = require("../src/validators/migration.validator");
const { verifyRecordAccuracy, calculateMigrationMetrics } = require("../src/utils/migration/accuracy");

describe("Data Migration Module", () => {
  let token;
  let otherToken;
  let user;
  let otherUser;

  beforeAll(async () => {
    await startDb();
    user = await registerUser("Migrator", `migrator_${Date.now()}@example.com`);
    token = user.token;
    otherUser = await registerUser("OtherUser", `other_${Date.now()}@example.com`);
    otherToken = otherUser.token;
  });

  afterAll(async () => {
    await stopDb();
  });

  describe("Unit: CSV Parser", () => {
    test("handles quoted fields, embedded commas, and escaped quotes", () => {
      const csv = 'Name,Manufacturer,Price,Tags\n"Smart TV, 55""","Samsung, Inc.",89999,"Electronics, Living Room"\nPhone,Apple,79999,Mobile';
      const { headers, rows } = parseCsv(csv);

      expect(headers).toEqual(["Name", "Manufacturer", "Price", "Tags"]);
      expect(rows.length).toBe(2);
      expect(rows[0].sourceRowNumber).toBe(2);
      expect(rows[0].rawRecord.Name).toBe('Smart TV, 55"');
      expect(rows[0].rawRecord.Manufacturer).toBe("Samsung, Inc.");
      expect(rows[0].rawRecord.Tags).toBe("Electronics, Living Room");
      expect(rows[1].sourceRowNumber).toBe(3);
      expect(rows[1].rawRecord.Name).toBe("Phone");
    });

    test("handles blank lines, empty cells, and whitespace", () => {
      const csv = "Name,Brand,Model\n\nRefrigerator,Samsung,\n   \nMicrowave,,MC28\n";
      const { rows } = parseCsv(csv);
      expect(rows.length).toBe(2);
      expect(rows[0].rawRecord.Name).toBe("Refrigerator");
      expect(rows[0].rawRecord.Model).toBe("");
      expect(rows[1].rawRecord.Name).toBe("Microwave");
      expect(rows[1].rawRecord.Brand).toBe("");
    });
  });

  describe("Unit: Field Mapper", () => {
    test("maps heterogeneous headers to Product schema fields", () => {
      const raw = {
        "Product Name": "Washing Machine",
        Manufacturer: "Bosch",
        "Model No.": "WAT28461IN",
        "Purchase Date": "2024-10-15",
        Cost: "45000",
        Shop: "Vijay Sales",
        "S/N": "SN987654",
        "Warranty End": "2026-10-15",
        Type: "Appliance",
        Tags: "Home;Laundry"
      };
      const mapped = mapRecord(raw);

      expect(mapped.productName).toBe("Washing Machine");
      expect(mapped.brand).toBe("Bosch");
      expect(mapped.model).toBe("WAT28461IN");
      expect(mapped.purchaseDate).toBe("2024-10-15");
      expect(mapped.purchasePrice).toBe("45000");
      expect(mapped.purchaseStore).toBe("Vijay Sales");
      expect(mapped.serialNumber).toBe("SN987654");
      expect(mapped.warrantyExpiryDate).toBe("2026-10-15");
      expect(mapped.category).toBe("Appliance");
      expect(mapped.tags).toBe("Home;Laundry");
    });
  });

  describe("Unit: Normalizer", () => {
    test("normalizes strings, trims whitespace without lowercasing user names", () => {
      const { normalized } = normalizeRecord({
        productName: "  Sony Bravia  ",
        brand: "  Sony  ",
        model: "  XR-55A80L  "
      });
      expect(normalized.productName).toBe("Sony Bravia");
      expect(normalized.brand).toBe("Sony");
      expect(normalized.model).toBe("XR-55A80L");
    });

    test("extracts currencies from price strings without guessing when none present", () => {
      const p1 = normalizeRecord({ purchasePrice: "₹ 89,999.00" });
      expect(p1.normalized.purchasePrice).toBe(89999);
      expect(p1.normalized.currency).toBe("INR");

      const p2 = normalizeRecord({ purchasePrice: "$1,299.50" });
      expect(p2.normalized.purchasePrice).toBe(1299.5);
      expect(p2.normalized.currency).toBe("USD");

      const p3 = normalizeRecord({ purchasePrice: "5000" });
      expect(p3.normalized.purchasePrice).toBe(5000);
      expect(p3.normalized.currency).toBeUndefined();
    });

    test("normalizes dates and adds warning for ambiguous numeric dates", () => {
      const r1 = normalizeRecord({ purchaseDate: "2025-05-10" });
      expect(r1.normalized.purchaseDate).toBeInstanceOf(Date);
      expect(r1.warnings.length).toBe(0);

      const r2 = normalizeRecord({ purchaseDate: "05/10/2025" }, { dateFormat: "DD/MM/YYYY" });
      expect(r2.normalized.purchaseDate).toBeInstanceOf(Date);
      expect(r2.warnings.some((w) => w.includes("Ambiguous numeric date"))).toBe(true);
    });

    test("normalizes tags: trim, lowercase, remove blanks, deduplicate", () => {
      const { normalized } = normalizeRecord({ tags: "Home; Kitchen, home; APPLIANCE ; ;" });
      expect(normalized.tags).toEqual(["home", "kitchen", "appliance"]);
    });
  });

  describe("Unit: Validation & Business Rules", () => {
    test("rejects missing productName", () => {
      const { isValid, errors } = validateMigrationRecord({
        brand: "Apple",
        purchasePrice: 999
      });
      expect(isValid).toBe(false);
      expect(errors).toContain("Product name is required");
    });

    test("rejects negative purchase price", () => {
      const { isValid, errors } = validateMigrationRecord({
        productName: "Toaster",
        purchasePrice: -50
      });
      expect(isValid).toBe(false);
      expect(errors).toContain("Purchase price cannot be negative");
    });

    test("rejects warranty expiry date on or before purchase date", () => {
      const { isValid, errors } = validateMigrationRecord({
        productName: "Heater",
        purchaseDate: new Date("2025-01-10"),
        warrantyExpiryDate: new Date("2024-01-10")
      });
      expect(isValid).toBe(false);
      expect(errors).toContain("Warranty expiry date must be after purchase date");
    });

    test("rejects purchase date in the future", () => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 2);
      const { isValid, errors } = validateMigrationRecord({
        productName: "Futuristic Gadget",
        purchaseDate: future
      });
      expect(isValid).toBe(false);
      expect(errors).toContain("Purchase date cannot be in the future");
    });

    test("allows missing optional fields but produces warnings", () => {
      const { isValid, errors, warnings } = validateMigrationRecord({
        productName: "Generic Cable",
        purchasePrice: 199
      });
      expect(isValid).toBe(true);
      expect(errors.length).toBe(0);
      expect(warnings).toContain("Brand is missing");
      expect(warnings).toContain("Model is missing");
      expect(warnings).toContain("Purchase store is missing");
      expect(warnings).toContain("No warranty expiry date specified");
    });
  });

  describe("Unit: Accuracy & Metrics Verification", () => {
    test("calculates exact Import Success Rate formula", () => {
      // 10 source, 8 valid, 6 imported, 2 rejected, 2 duplicate among valid
      const metrics = calculateMigrationMetrics({
        validRecordCount: 8,
        importedRecordCount: 6,
        records: []
      });
      expect(metrics.importSuccessRate).toBe(75.0);
    });

    test("calculates 100% Data Accuracy when all expected fields match Product document", () => {
      const source = {
        productName: "Air Conditioner",
        brand: "Daikin",
        model: "FTKF50",
        purchasePrice: 42000,
        currency: "INR",
        serialNumber: "DK123456"
      };
      const product = { ...source, _id: "prod123" };
      const accuracy = verifyRecordAccuracy(source, product);

      expect(accuracy.fieldsExpected).toBe(6);
      expect(accuracy.fieldsImported).toBe(6);
      expect(accuracy.fieldsCorrect).toBe(6);
      expect(accuracy.fieldComparisons.every((c) => c.isMatch)).toBe(true);
    });

    test("calculates degraded Data Accuracy when fields mismatch", () => {
      const source = {
        productName: "Headphones",
        brand: "Sony",
        purchasePrice: 15000,
        currency: "INR"
      };
      const product = {
        productName: "Headphones",
        brand: "Sony",
        purchasePrice: 12000, // intentional mismatch
        currency: "INR"
      };
      const accuracy = verifyRecordAccuracy(source, product);

      expect(accuracy.fieldsExpected).toBe(4);
      expect(accuracy.fieldsCorrect).toBe(3);

      const metrics = calculateMigrationMetrics({
        validRecordCount: 1,
        importedRecordCount: 1,
        records: [{ outcome: "imported", accuracyChecks: accuracy }]
      });
      expect(metrics.dataAccuracy).toBe(75.0);
    });
  });

  describe("Integration: API Endpoints (/api/v1/migrations)", () => {
    let migrationId;

    test("requires authentication", async () => {
      const res = await request(app).get("/api/v1/migrations");
      expect(res.statusCode).toBe(401);
    });

    test("POST /preview generates a preview with 10 records matching benchmark scenario", async () => {
      const csvData = [
        "Name,Manufacturer,Model No,Purchase Date,Cost,Shop,S/N,Warranty End,Type,Tags",
        "Samsung Refrigerator,Samsung,RF28A,12/03/2025,₹89999,Croma,SN1001,12/03/2028,Appliance,Home;Kitchen",
        "Sony WH-1000XM5,Sony,WH-1000XM5,2025-05-10,29999,Amazon,SN1002,2027-05-10,Audio,Personal",
        "Dell Laptop,Dell,Latitude 5420,,55000,Amazon,SN1003,2027-09-01,Computer,Work",
        "Samsung Refrigerator,Samsung,RF28A,12/03/2025,89999,Croma,SN1001,12/03/2028,Appliance,Home;Kitchen",
        "Broken Record,,MODEL-X,not-a-date,-200,,SN1005,invalid-date,,",
        "Apple iPad Air,Apple,iPad Air M2,2025-03-01,$599,Apple Store,SN1006,2026-03-01,Tablet,Personal;Work",
        "LG OLED TV,LG,OLED65C3,2024-11-20,Rs. 120000,Reliance Digital,SN1007,2026-11-20,Television,Living Room;Entertainment",
        ",Anker,737 Power Bank,2025-02-10,9999,Amazon,SN1008,2026-02-10,Accessory,Travel",
        "Bose QuietComfort 45,Bose,QC45,2025-04-12,24999,Croma,SN1009,2026-04-12,Audio,Travel;Music",
        "Apple iPad Air,Apple,iPad Air M2,2025-03-01,599,Apple Store,SN1006,2026-03-01,Tablet,Personal;Work"
      ].join("\n");

      const res = await request(app)
        .post("/api/v1/migrations/preview")
        .set("Authorization", `Bearer ${token}`)
        .send({
          content: csvData,
          fileName: "test-benchmark.csv"
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sourceRecordCount).toBe(10);
      expect(res.body.data.validRecordCount).toBe(8);
      expect(res.body.data.rejectedRecordCount).toBe(2);
      expect(res.body.data.duplicateRecordCount).toBe(2);
      expect(res.body.data.importableRecordCount).toBe(6);

      migrationId = res.body.data.migrationId;
      expect(migrationId).toBeDefined();
    });

    test("POST /:id/import executes import and verifies exact 75% success rate and 100% accuracy", async () => {
      const res = await request(app)
        .post(`/api/v1/migrations/${migrationId}/import`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("completed");
      expect(res.body.data.importedRecordCount).toBe(6);
      expect(res.body.data.rejectedRecordCount).toBe(2);
      expect(res.body.data.duplicateRecordCount).toBe(2);
      expect(res.body.data.importSuccessRate).toBe(75.0);
      expect(res.body.data.dataAccuracy).toBe(100.0);

      // Verify that 6 real Product documents exist in MongoDB
      const createdProducts = await Product.find({ userId: user.userId, isDeleted: false });
      expect(createdProducts.length).toBe(6);
    });

    test("GET /:id/evidence retrieves structured audit trail with before/after comparisons", async () => {
      const res = await request(app)
        .get(`/api/v1/migrations/${migrationId}/evidence`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.importSuccessRate).toBe(75.0);
      expect(res.body.data.summary.dataAccuracy).toBe(100.0);

      const evidence = res.body.data.evidenceRecords;
      expect(evidence.length).toBe(10);

      // Inspect imported record
      const importedRow = evidence.find((e) => e.outcome === "imported");
      expect(importedRow).toBeDefined();
      expect(importedRow.rawRecord).toBeDefined();
      expect(importedRow.mappedRecord).toBeDefined();
      expect(importedRow.normalizedRecord).toBeDefined();
      expect(importedRow.resultingProduct).toBeDefined();
      expect(importedRow.accuracyChecks.fieldsCorrect).toBeGreaterThan(0);

      // Inspect rejected record
      const rejectedRow = evidence.find((e) => e.outcome === "rejected");
      expect(rejectedRow).toBeDefined();
      expect(rejectedRow.errors.length).toBeGreaterThan(0);

      // Inspect duplicate record
      const duplicateRow = evidence.find((e) => e.outcome === "duplicate");
      expect(duplicateRow).toBeDefined();
      expect(duplicateRow.duplicateOf).toBeDefined();
    });

    test("detects duplicate against existing product in database", async () => {
      // Create a new batch containing SN1001 which was already imported
      const csv = "Name,Manufacturer,Model No,Cost,S/N\nNew Refrigerator,Samsung,RF28A,89999,SN1001";
      const res = await request(app)
        .post("/api/v1/migrations/preview")
        .set("Authorization", `Bearer ${token}`)
        .send({ content: csv, fileName: "dup-existing.csv" });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.duplicateRecordCount).toBe(1);
      expect(res.body.data.importableRecordCount).toBe(0);
      expect(res.body.data.records[0].duplicateOf.type).toBe("existing");
    });

    test("enforces user isolation: other user cannot see migration or evidence", async () => {
      const getRes = await request(app)
        .get(`/api/v1/migrations/${migrationId}`)
        .set("Authorization", `Bearer ${otherToken}`);
      expect(getRes.statusCode).toBe(404);

      const evRes = await request(app)
        .get(`/api/v1/migrations/${migrationId}/evidence`)
        .set("Authorization", `Bearer ${otherToken}`);
      expect(evRes.statusCode).toBe(404);
    });

    test("handles E11000 duplicate race condition gracefully without failing migration", async () => {
      // Simulate race condition by having duplicate serial created in DB right after preview
      const raceCsv = "Name,Manufacturer,Cost,S/N\nRace Product,Sony,20000,SN_RACE_999";
      const prev = await request(app)
        .post("/api/v1/migrations/preview")
        .set("Authorization", `Bearer ${token}`)
        .send({ content: raceCsv, fileName: "race.csv" });

      const raceMigrationId = prev.body.data.migrationId;

      // In the background, create product with SN_RACE_999 before import runs
      await Product.create({
        userId: user.userId,
        productName: "Competing Process Product",
        serialNumber: "SN_RACE_999"
      });

      // Now execute import
      const importRes = await request(app)
        .post(`/api/v1/migrations/${raceMigrationId}/import`)
        .set("Authorization", `Bearer ${token}`);

      expect(importRes.statusCode).toBe(200);
      expect(importRes.body.data.status).toBe("completed");
      expect(importRes.body.data.importedRecordCount).toBe(0);
      expect(importRes.body.data.duplicateRecordCount).toBe(1);
      expect(importRes.body.data.records[0].outcome).toBe("duplicate");
      expect(importRes.body.data.records[0].duplicateOf.matchReason).toContain("Duplicate key race");
    });
  });
});

// Phase 4 §5 — the warranty-status engine must be ONE source of truth.
// These tests exercise the backend engine directly AND run the frontend
// mirror (public/js/warranty.js) against the same fixtures, failing CI if the
// two ever diverge.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  warrantyStatusOf,
  primaryWarrantyStatus,
  statusLabel,
  EXPIRING_SOON_DAYS,
  WARRANTY_STATUSES
} = require("../src/services/warranty.service");

const NOW = new Date("2026-08-12T12:00:00Z");

function daysFromNow(days) {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  return d;
}

describe("Warranty-status engine (backend)", () => {
  test("statuses are exactly the Phase 4 set", () => {
    expect(WARRANTY_STATUSES.sort()).toEqual(
      ["not_started", "active", "expiring_soon", "expired", "unknown"].sort()
    );
  });

  test("unknown when no expiry date", () => {
    expect(warrantyStatusOf({}, NOW).status).toBe("unknown");
    expect(warrantyStatusOf({ expiryDate: null }, NOW).status).toBe("unknown");
    expect(warrantyStatusOf(undefined, NOW).status).toBe("unknown");
  });

  test("not_started when start date is in the future", () => {
    const r = warrantyStatusOf({ startDate: daysFromNow(10), expiryDate: daysFromNow(400) }, NOW);
    expect(r.status).toBe("not_started");
  });

  test("expired when expiry date has passed", () => {
    const r = warrantyStatusOf({ startDate: daysFromNow(-400), expiryDate: daysFromNow(-1) }, NOW);
    expect(r.status).toBe("expired");
    expect(r.daysRemaining).toBe(-1);
  });

  test("expires today is expired", () => {
    const r = warrantyStatusOf({ expiryDate: daysFromNow(0) }, NOW);
    expect(r.status).toBe("expired");
    expect(r.daysRemaining).toBe(0);
  });

  test("active when expiry is far out", () => {
    const r = warrantyStatusOf({ startDate: daysFromNow(-30), expiryDate: daysFromNow(400) }, NOW);
    expect(r.status).toBe("active");
  });

  test("expiring_soon inside the dashboard window", () => {
    const inside = warrantyStatusOf({ expiryDate: daysFromNow(EXPIRING_SOON_DAYS) }, NOW);
    expect(inside.status).toBe("expiring_soon");
    const day1 = warrantyStatusOf({ expiryDate: daysFromNow(1) }, NOW);
    expect(day1.status).toBe("expiring_soon");
    const justOutside = warrantyStatusOf({ expiryDate: daysFromNow(EXPIRING_SOON_DAYS + 1) }, NOW);
    expect(justOutside.status).toBe("active");
  });

  test("primaryWarrantyStatus uses purchase date as start", () => {
    const p = { purchaseDate: daysFromNow(5), warrantyExpiryDate: daysFromNow(400) };
    expect(primaryWarrantyStatus(p, NOW).status).toBe("not_started");
    const p2 = { purchaseDate: daysFromNow(-30), warrantyExpiryDate: daysFromNow(400) };
    expect(primaryWarrantyStatus(p2, NOW).status).toBe("active");
  });

  test("statusLabel covers every status", () => {
    for (const s of WARRANTY_STATUSES) {
      expect(statusLabel(s).length).toBeGreaterThan(0);
    }
    expect(statusLabel("bogus")).toBe("Unknown");
  });

  test("daysRemaining is null for unknown", () => {
    expect(warrantyStatusOf({}, NOW).daysRemaining).toBeNull();
  });
});

describe("Frontend mirror drift guard", () => {
  // Fixtures covering every status and the exact boundary.
  const fixtures = [
    { name: "no dates", period: {} },
    { name: "null expiry", period: { expiryDate: null } },
    { name: "future start", period: { startDate: daysFromNow(10), expiryDate: daysFromNow(400) } },
    { name: "long past", period: { startDate: daysFromNow(-400), expiryDate: daysFromNow(-1) } },
    { name: "expires today", period: { expiryDate: daysFromNow(0) } },
    { name: "far out", period: { startDate: daysFromNow(-30), expiryDate: daysFromNow(400) } },
    { name: "boundary expiring", period: { expiryDate: daysFromNow(EXPIRING_SOON_DAYS) } },
    { name: "boundary active", period: { expiryDate: daysFromNow(EXPIRING_SOON_DAYS + 1) } },
    { name: "one day left", period: { expiryDate: daysFromNow(1) } },
    { name: "start same day", period: { startDate: NOW, expiryDate: daysFromNow(365) } }
  ];

  test("frontend mirror matches backend on every fixture", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "public", "js", "warranty.js"), "utf8");
    const sandbox = {
      console,
      Date,
      Math,
      Number,
      String,
      Boolean,
      Array,
      Object,
      isFinite,
      isNaN,
      parseInt,
      parseFloat,
      encodeURIComponent,
      decodeURIComponent
    };
    sandbox.globalThis = sandbox;
    const context = vm.createContext(sandbox);
    vm.runInContext(src, context, { filename: "warranty.js" });

    expect(typeof sandbox.warrantyStatusOf).toBe("function");
    expect(typeof sandbox.statusLabel).toBe("function");
    // consts live in the shared lexical scope, not on the global — probe
    // from inside the context (same pattern as frontend-modules.test.js).
    expect(vm.runInContext("EXPIRING_SOON_DAYS", context)).toBe(EXPIRING_SOON_DAYS);

    for (const f of fixtures) {
      const backend = warrantyStatusOf(f.period, NOW);
      const frontend = sandbox.warrantyStatusOf(f.period, NOW);
      expect(frontend.status).toBe(backend.status);
      expect(frontend.daysRemaining).toBe(backend.daysRemaining);
      expect(frontend.label).toBe(backend.label);
    }
  });

  test("frontend mirror exposes the same label mapping", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "public", "js", "warranty.js"), "utf8");
    const sandbox = { console, Date, Math, Number, String, Boolean, Array, Object };
    sandbox.globalThis = sandbox;
    const context = vm.createContext(sandbox);
    vm.runInContext(src, context, { filename: "warranty.js" });
    for (const s of WARRANTY_STATUSES) {
      expect(sandbox.statusLabel(s)).toBe(statusLabel(s));
    }
  });
});

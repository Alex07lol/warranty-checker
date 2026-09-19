// Regression guard for the frontend module split. app.js was split into
// utils.js / api.js / auth.js + app.js (classic scripts sharing global scope,
// loaded in that order by index.html). This test runs the four files in a
// stubbed browser environment the same way the page does, and boots the app
// in guest mode — so a future reordering, a moved helper, or a let/const
// change that breaks cross-file resolution fails `npm test` instead of the
// production page.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PUBLIC = path.join(__dirname, "..", "public");
const SCRIPTS = ["warranty.js", "utils.js", "api.js", "auth.js", "app.js"];

function makeEl() {
  const classes = new Set();
  return {
    classList: {
      add(...cls) { cls.forEach(c => classes.add(c)); },
      remove(...cls) { cls.forEach(c => classes.delete(c)); },
      toggle(cls, force) {
        if (force === undefined) {
          if (classes.has(cls)) { classes.delete(cls); return false; }
          classes.add(cls); return true;
        }
        if (force) { classes.add(cls); return true; }
        classes.delete(cls); return false;
      },
      contains(cls) { return classes.has(cls); }
    },
    style: {},
    dataset: {},
    textContent: "",
    innerHTML: "",
    value: "",
    src: "",
    disabled: false,
    checked: false,
    addEventListener() {},
    appendChild() {},
    append() {},
    setAttribute() {},
    remove() {},
    removeChild() {},
    insertAdjacentHTML() {},
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    getContext() { return null; }
  };
}

function loadAppSandbox() {
  const elements = {};
  const storage = new Map();
  let onDomContentLoaded = null;

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    WeakMap,
    encodeURIComponent,
    decodeURIComponent,
    isFinite,
    isNaN,
    parseInt,
    parseFloat,
    FormData: class {},
    AbortController,
    performance: { now: () => Date.now() },
    requestAnimationFrame: (cb) => { setTimeout(() => cb(performance.now()), 16); return 1; },
    cancelAnimationFrame: () => {},
    navigator: { clipboard: { writeText: async () => {} } },
    localStorage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
      clear: () => storage.clear()
    },
    // prefers-reduced-motion: reduce — animateCountUp takes its synchronous
    // fast path, so the guest boot never schedules animation timers and the
    // test can finish deterministically (that RAF branch is unchanged by the
    // module split and is exercised by manual testing).
    window: { matchMedia: () => ({ matches: true }), isSecureContext: true, open: () => null, confirm: () => true, location: {} },
    document: {
      getElementById: (id) => elements[id] || (elements[id] = makeEl()),
      querySelector: () => makeEl(),
      querySelectorAll: () => [],
      createElement: () => makeEl(),
      createDocumentFragment: () => ({ appendChild() {} }),
      body: makeEl(),
      addEventListener: (ev, cb) => { if (ev === "DOMContentLoaded") onDomContentLoaded = cb; },
      visibilityState: "visible"
    },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ data: {} }) })
  };
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  for (const file of SCRIPTS) {
    const src = fs.readFileSync(path.join(PUBLIC, "js", file), "utf8");
    vm.runInContext(src, context, { filename: file });
  }
  return {
    sandbox,
    context,
    get onDomContentLoaded() { return onDomContentLoaded; }
  };
}

describe("Frontend module split", () => {
  test("index.html loads the scripts in dependency order", () => {
    const html = fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8");
    const order = ["/js/warranty.js", "/js/utils.js", "/js/api.js", "/js/auth.js", "/js/app.js"];
    let lastIndex = -1;
    for (const tag of order) {
      const idx = html.indexOf(tag);
      expect(idx).toBeGreaterThan(-1);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
    // The split files must all be present; effects.js stays a module.
    expect(html).toContain('type="module" src="/js/effects.js');
  });

  test("cross-file globals resolve and the guest boot path runs", async () => {
    const { sandbox, context, onDomContentLoaded } = loadAppSandbox();

    const mustBeFunction = [
      // warranty.js
      "warrantyStatusOf", "statusLabel",
      // utils.js
      "toast", "escapeHtml", "fmtMoney", "fmtDate", "animateCountUp", "warrantyInfo",
      "productImage", "emptyState", "skeletonProductCards", "skeletonLineCards",
      "setStatsSkeleton", "daysFromNow", "copyToClipboard",
      // dialog helpers (a11y pass)
      "openDialog", "closeDialog",
      // api.js
      "getToken", "setToken", "getUser", "setUser", "api",
      // auth.js
      "isGuest", "openLogin", "requireAuth", "applyGuestMode",
      "switchAuthTab", "doLogin", "doRegister", "logout",
      // auth.js — duplicate-email popup
      "isGmailAddress", "isDuplicateEmailError", "showDuplicateEmailDialog",
      "closeDuplicateEmailDialog", "duplicateEmailSignIn", "duplicateEmailUseOther",
      // app.js
      "showView", "makeProductCard", "loadDashboard", "init"
    ];
    for (const name of mustBeFunction) {
      expect(typeof sandbox[name]).toBe("function");
    }
    // api.js top-level consts live in the shared lexical scope (not on the
    // global object) — probe them from inside the context like the app does.
    expect(vm.runInContext("API", context)).toBe("/api/v1");
    expect(vm.runInContext("TOKEN_KEY", context)).toBe("wv_token");

    // app.js load-time code depends on utils.daysFromNow — proves order works.
    expect(sandbox.demoProducts().length).toBeGreaterThan(0);

    // Boot the app exactly like the page does (DOMContentLoaded -> init).
    expect(typeof onDomContentLoaded).toBe("function");
    onDomContentLoaded();

    // Guest-mode enterApp: dashboard + products render from demo data without
    // a single network call, and no undefined cross-file reference throws.
    await sandbox.enterApp();

    // escapeHtml still neutralises the XSS payloads it guards.
    const escaped = sandbox.escapeHtml("<script>alert(1)</script>");
    expect(escaped).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  test("OCR field editing and approval helpers work correctly", () => {
    const { sandbox } = loadAppSandbox();
    expect(typeof sandbox.updateOcrApprovalCount).toBe("function");
    expect(typeof sandbox.toggleAllOcrApprovals).toBe("function");
    expect(typeof sandbox.fillCameraConfirmForm).toBe("function");
    expect(typeof sandbox.getApprovedOcrData).toBe("function");
    expect(typeof sandbox.openDocOcrReview).toBe("function");

    // Populate with test OCR data
    sandbox.fillCameraConfirmForm({
      productName: "Microwave Oven",
      brand: "Panasonic",
      model: "NN-SN686S",
      serialNumber: "SN12345",
      purchasePrice: 199.99,
      purchaseStore: "Best Buy",
      purchaseDate: "2026-01-15",
      warrantyExpiryDate: "2027-01-15"
    });

    // Verify all 8 are approved by default when populated with complete data
    let res = sandbox.getApprovedOcrData();
    expect(res.count).toBe(8);
    expect(res.approved.productName).toBe("Microwave Oven");
    expect(res.approved.brand).toBe("Panasonic");
    expect(res.approved.purchasePrice).toBe(199.99);

    // Deselect all
    sandbox.toggleAllOcrApprovals(false);
    res = sandbox.getApprovedOcrData();
    expect(res.count).toBe(0);
    expect(Object.keys(res.approved).length).toBe(0);
    // allEdited still has the edited values
    expect(res.allEdited.productName).toBe("Microwave Oven");

    // Approve one field (serialNumber)
    sandbox.document.getElementById("approve-serial").checked = true;
    sandbox.updateOcrApprovalCount();
    res = sandbox.getApprovedOcrData();
    expect(res.count).toBe(1);
    expect(res.approved).toEqual({ serialNumber: "SN12345" });

    // Approve some fields (serialNumber + warrantyExpiryDate)
    sandbox.document.getElementById("approve-expiry").checked = true;
    sandbox.updateOcrApprovalCount();
    res = sandbox.getApprovedOcrData();
    expect(res.count).toBe(2);
    expect(res.approved).toEqual({ serialNumber: "SN12345", warrantyExpiryDate: "2027-01-15" });

    // Approve all
    sandbox.toggleAllOcrApprovals(true);
    res = sandbox.getApprovedOcrData();
    expect(res.count).toBe(8);
  });

  test("device pop-up notification helpers work across permission states and devices", async () => {
    const { sandbox } = loadAppSandbox();

    // Verify all notification functions exist
    const funcs = [
      "initServiceWorker",
      "getDeviceNotificationPermission",
      "updateDeviceNotificationUI",
      "requestDeviceNotificationPermission",
      "toggleDeviceNotificationToggle",
      "showDeviceNotification",
      "testDeviceNotification",
      "dispatchUnreadDeviceNotifications"
    ];
    for (const fn of funcs) {
      expect(typeof sandbox[fn]).toBe("function");
    }

    // 1. In default sandbox (unsupported environment: window.Notification undefined)
    expect(sandbox.getDeviceNotificationPermission()).toBe("unsupported");
    sandbox.updateDeviceNotificationUI();
    const badgeEl = sandbox.document.getElementById("device-notif-badge");
    const statusEl = sandbox.document.getElementById("device-notif-status-text");
    const enableBtn = sandbox.document.getElementById("enable-device-notif-btn");
    const testBtn = sandbox.document.getElementById("test-device-notif-btn");
    const popupToggle = sandbox.document.getElementById("pref-device-popups");

    expect(badgeEl.textContent).toBe("Unsupported");
    expect(badgeEl.classList.contains("badge-unsupported")).toBe(true);
    expect(statusEl.textContent).toContain("does not support");
    expect(enableBtn.style.display).toBe("none");
    expect(testBtn.style.display).toBe("none");
    expect(popupToggle.disabled).toBe(true);

    const reqRes = await sandbox.requestDeviceNotificationPermission();
    expect(reqRes).toBe("unsupported");

    // 2. Mock browser Notification API
    let requestPermissionResult = "granted";
    const notificationCalls = [];
    class MockNotification {
      constructor(title, options) {
        this.title = title;
        this.options = options;
        notificationCalls.push({ title, options });
      }
      close() {}
    }
    MockNotification.permission = "default";
    MockNotification.requestPermission = async () => {
      MockNotification.permission = requestPermissionResult;
      return requestPermissionResult;
    };

    sandbox.window.Notification = MockNotification;
    sandbox.Notification = MockNotification;

    // In 'default' state: Action Required
    sandbox.updateDeviceNotificationUI();
    expect(sandbox.getDeviceNotificationPermission()).toBe("default");
    expect(badgeEl.textContent).toBe("Action Required");
    expect(badgeEl.classList.contains("badge-prompt")).toBe(true);
    expect(enableBtn.style.display).toBe("");
    expect(testBtn.style.display).toBe("none");

    // 3. User requests permission -> Granted
    requestPermissionResult = "granted";
    const grantedRes = await sandbox.requestDeviceNotificationPermission();
    expect(grantedRes).toBe("granted");
    expect(MockNotification.permission).toBe("granted");
    expect(badgeEl.textContent).toBe("Active");
    expect(badgeEl.classList.contains("badge-granted")).toBe(true);
    expect(testBtn.style.display).toBe("");
    expect(enableBtn.style.display).toBe("none");
    expect(popupToggle.checked).toBe(true);

    // Welcome notification sent
    expect(notificationCalls.length).toBeGreaterThan(0);
    expect(notificationCalls[0].title).toBe("WarrantyVault Notifications Active");

    // 4. Test Notification button
    await sandbox.testDeviceNotification();
    const testNotif = notificationCalls.find(c => c.title === "WarrantyVault Test Alert");
    expect(testNotif).toBeDefined();
    expect(testNotif.options.body).toContain("Device notifications are working correctly");

    // 5. Unread notification dispatch and deduplication
    const mockNotifs = [
      { _id: "notif-1", title: "Warranty Expiring", message: "Laptop warranty expires in 5 days.", isRead: false, notificationType: "warranty_expiry" },
      { _id: "notif-2", title: "Service Reminder", message: "Car service due.", isRead: false, notificationType: "service_reminder" },
      { _id: "notif-3", title: "Already Read", message: "Nothing new.", isRead: true, notificationType: "warranty_expiry" }
    ];

    sandbox.dispatchUnreadDeviceNotifications(mockNotifs);
    const unreadAlerts = notificationCalls.filter(c => c.options.tag && c.options.tag.startsWith("wv-alert-"));
    expect(unreadAlerts.length).toBe(2);
    expect(unreadAlerts.some(a => a.options.tag === "wv-alert-notif-1")).toBe(true);
    expect(unreadAlerts.some(a => a.options.tag === "wv-alert-notif-2")).toBe(true);

    // Deduplication check: dispatching again should NOT re-notify
    const countBefore = notificationCalls.length;
    sandbox.dispatchUnreadDeviceNotifications(mockNotifs);
    expect(notificationCalls.length).toBe(countBefore);

    // 6. User mutes popups via toggle
    await sandbox.toggleDeviceNotificationToggle(false);
    expect(sandbox.localStorage.getItem("wv_device_popups_disabled")).toBe("true");
    expect(badgeEl.textContent).toBe("Muted");
    expect(popupToggle.checked).toBe(false);

    // Dispatches while muted should be suppressed
    sandbox.dispatchUnreadDeviceNotifications([
      { _id: "notif-4", title: "New Unread", message: "TV warranty alert", isRead: false }
    ]);
    expect(notificationCalls.length).toBe(countBefore);

    // 7. Re-enable via toggle
    await sandbox.toggleDeviceNotificationToggle(true);
    expect(sandbox.localStorage.getItem("wv_device_popups_disabled")).toBeNull();
    expect(badgeEl.textContent).toBe("Active");
    expect(popupToggle.checked).toBe(true);
  });
});

// Register flow (password minimum + duplicate-email popup) and the repair-centre
// Directions links, which must work on phones without a place_id or a URI scheme.
describe("Register password rule, duplicate-email popup and repair directions", () => {
  const INDEX = fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8");
  const AUTH = fs.readFileSync(path.join(PUBLIC, "js", "auth.js"), "utf8");
  const APP = fs.readFileSync(path.join(PUBLIC, "js", "app.js"), "utf8");
  const VALIDATOR = fs.readFileSync(
    path.join(__dirname, "..", "src", "validators", "auth.validator.js"),
    "utf8"
  );

  test("the register form advertises the real 8-character password minimum", () => {
    const input = INDEX.match(/<input type="password" id="reg-password"[^>]*>/)[0];
    expect(input).toContain('placeholder="Min. 8 characters"');
    expect(input).toContain('minlength="8"');
    expect(input).not.toContain("Min. 6");
    // The browser hint, the client guard and the Joi schema must agree.
    expect(AUTH).toMatch(/password\.length < 8/);
    expect(VALIDATOR).toMatch(/password: Joi\.string\(\)\.min\(8\)\.required\(\)/);
  });

  test("a duplicate-email alert dialog exists and doRegister opens it", () => {
    const overlay = INDEX.match(/id="dup-email-overlay"[^>]*>/)[0];
    expect(overlay).toContain('role="alertdialog"');
    expect(overlay).toContain('aria-modal="true"');
    expect(overlay).toContain('aria-labelledby="dup-email-title"');
    expect(INDEX).toContain('id="dup-email-title"');
    expect(INDEX).toContain("This email already exists in the database");
    expect(INDEX).toContain('onclick="duplicateEmailSignIn()"');
    expect(INDEX).toContain('onclick="duplicateEmailUseOther()"');
    // A duplicate must open the popup instead of only printing a line under the form.
    expect(AUTH).toMatch(/if \(isDuplicateEmailError\(e\)\) \{\s*showDuplicateEmailDialog\(email\);/);
  });

  test("showDuplicateEmailDialog names the address and explains the Gmail alias rule", () => {
    const { sandbox } = loadAppSandbox();
    const body = sandbox.document.getElementById("dup-email-body");
    const overlay = sandbox.document.getElementById("dup-email-overlay");

    const gmail = { status: 409, message: "This email address already exists in the database" };
    expect(sandbox.isDuplicateEmailError(gmail)).toBe(true);
    expect(sandbox.isDuplicateEmailError({ status: 401, message: "Invalid email or password" })).toBe(false);

    sandbox.showDuplicateEmailDialog("john.doe+tag@gmail.com");
    expect(body.innerHTML).toContain("john.doe+tag@gmail.com");
    expect(body.innerHTML).toContain("already registered");
    expect(body.innerHTML).toContain("Gmail ignores dots");
    expect(overlay.classList.contains("open")).toBe(true);

    // A non-Gmail address still gets the popup, without the Gmail explanation.
    sandbox.showDuplicateEmailDialog("someone@example.com");
    expect(body.innerHTML).not.toContain("Gmail ignores dots");
    sandbox.closeDuplicateEmailDialog();
    expect(overlay.classList.contains("open")).toBe(false);
  });

  test("directions links search by name and address — no place ids, no URI schemes", () => {
    const { sandbox } = loadAppSandbox();
    const query = (centre) => decodeURIComponent(sandbox.getLocateHref(centre).split("query=")[1]);

    expect(sandbox.getLocateHref({})).toBe("");
    expect(query({ name: "FixItNow", address: "Ajmal Khan Road, Karol Bagh", city: "New Delhi" }))
      .toBe("FixItNow, Ajmal Khan Road, Karol Bagh, New Delhi");
    // A city already inside the address is not repeated in the query.
    expect(query({ name: "ElectroCare", address: "Sector 18, Noida", city: "Noida" }))
      .toBe("ElectroCare, Sector 18, Noida");

    const href = sandbox.getLocateHref({ name: "Only Name", placeId: "ChIJ123", lat: 1, lng: 2 });
    expect(href.startsWith("https://www.google.com/maps/search/?api=1&query=")).toBe(true);
    expect(href).not.toContain("place_id");
    expect(href).not.toContain("ChIJ123");
    expect(APP).not.toContain("q=place_id:");
    expect(APP).not.toMatch(/["'](geo|maps|intent):/);
  });

  test("a centre without coordinates still renders with a working Directions link", () => {
    const { sandbox } = loadAppSandbox();
    const card = sandbox.repairCentreCard({
      name: "No Coord Repairs",
      address: "Some Street 5",
      city: "Pune",
      rating: 4.1
    });
    expect(card).toContain("Distance unavailable");
    expect(card).toContain("🗺️ Directions");
    expect(card).toContain("https://www.google.com/maps/search/?api=1&amp;query=No%20Coord%20Repairs");
  });
});

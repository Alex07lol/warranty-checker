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
const SCRIPTS = ["utils.js", "api.js", "auth.js", "app.js"];

function makeEl() {
  return {
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    style: {},
    dataset: {},
    textContent: "",
    innerHTML: "",
    value: "",
    src: "",
    disabled: false,
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
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
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
    const order = ["/js/utils.js", "/js/api.js", "/js/auth.js", "/js/app.js"];
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
});

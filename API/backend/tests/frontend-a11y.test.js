// Regression guard for the Phase 3 accessibility pass (modal dialogs,
// screen-reader labels, keyboard-only operation). Static checks assert the
// app shell carries the required ARIA scaffolding; unit checks exercise the
// focus-trap helpers in a stubbed DOM the same way the page uses them.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PUBLIC = path.join(__dirname, "..", "public");
const INDEX = fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8");
const APP_CSS = fs.readFileSync(path.join(PUBLIC, "css", "app.css"), "utf8");
const UTILS = fs.readFileSync(path.join(PUBLIC, "js", "utils.js"), "utf8");

function makeEl() {
  return {
    classList: {
      add() {},
      remove() {},
      contains() { return false; }
    },
    style: {},
    dataset: {},
    textContent: "",
    value: "",
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    focus() {},
    offsetParent: null
  };
}

describe("Frontend accessibility scaffolding", () => {
  test("both overlays are modal dialogs with accessible names", () => {
    const detail = INDEX.match(/id="detail-overlay"[^>]*>/)[0];
    const form = INDEX.match(/id="product-form-overlay"[^>]*>/)[0];
    expect(detail).toContain('role="dialog"');
    expect(detail).toContain('aria-modal="true"');
    expect(detail).toContain('aria-labelledby="detail-name"');
    expect(form).toContain('role="dialog"');
    expect(form).toContain('aria-modal="true"');
    expect(form).toContain('aria-labelledby="product-form-title"');
  });

  test("labelledby targets exist in the DOM", () => {
    expect(INDEX).toContain('id="detail-name"');
    expect(INDEX).toContain('id="product-form-title"');
  });

  test("icon-only controls carry accessible names", () => {
    expect(INDEX).toMatch(/id="detail-back-btn"[^>]*aria-label="Back"/);
    expect(INDEX).toMatch(/id="product-form-close"[^>]*aria-label="Close"/);
    expect(INDEX).toMatch(/id="camera-upload-area"[^>]*role="button"/);
    expect(INDEX).toMatch(/id="camera-upload-area"[^>]*tabindex="0"/);
    expect(INDEX).toMatch(/id="camera-upload-area"[^>]*aria-label="Upload a receipt, warranty card or PDF"/);
  });

  test("toast announces updates to screen readers", () => {
    expect(INDEX).toMatch(/id="toast"[^>]*role="status"/);
    expect(INDEX).toMatch(/id="toast"[^>]*aria-live="polite"/);
  });

  test("primary nav is labelled and marks the current page", () => {
    expect(INDEX).toMatch(/<nav class="bottom-nav"[^>]*aria-label="Primary"/);
    const APP = fs.readFileSync(path.join(PUBLIC, "js", "app.js"), "utf8");
    expect(APP).toContain("setAttribute('aria-current', 'page')");
    expect(APP).toContain("removeAttribute('aria-current')");
  });

  test("decorative icons are hidden from assistive tech", () => {
    // The 5 nav icons + 2 detail action icons all carry aria-hidden now.
    const decorated = INDEX.match(/<svg[^>]*aria-hidden="true"/g) || [];
    expect(decorated.length).toBeGreaterThanOrEqual(7);
  });

  test("screen-reader-only utility is defined (no visible label leak)", () => {
    expect(APP_CSS).toContain(".sr-only");
    expect(APP_CSS).toMatch(/\.sr-only\s*{[^}]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
  });

  test("view titles expose a heading outline", () => {
    expect((INDEX.match(/role="heading"/g) || []).length).toBeGreaterThanOrEqual(6);
    expect(INDEX).toContain('aria-level="1"');
    expect(INDEX).toContain('aria-level="2"');
  });

  test("camera upload area is keyboard-operable (inline onkeydown/onkeyup -> cameraUploadKey)", () => {
    // Keyboard activation moved to inline attributes on the element (the
    // SonarQube Web analyzer requires the handler on the element itself);
    // the shared helper must exist in utils.js and be referenced from both
    // the HTML attribute and a global-scope declaration.
    const INDEX = fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8");
    const UTILS = fs.readFileSync(path.join(PUBLIC, "js", "utils.js"), "utf8");
    expect(INDEX).toContain("onkeydown=\"cameraUploadKey(event)\"");
    expect(INDEX).toContain("onkeyup=\"cameraUploadKey(event)\"");
    expect(UTILS).toMatch(/function cameraUploadKey\(e\)/);
    // The helper activates the hidden file input (Enter on keydown, Space on
    // keyup, preventDefault to avoid page scroll).
    expect(UTILS).toMatch(/e\.key !== 'Enter' && e\.key !== ' '/);
    expect(UTILS).toContain("camera-file-input");
  });
});

describe("Dialog focus-trap helpers", () => {
  function loadUtils() {
    const sandbox = {
      console,
      setTimeout, clearTimeout, Promise, Date, Math, JSON, Number, String, Boolean,
      Array, Object, WeakMap, isFinite, isNaN, parseInt, parseFloat,
      requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
      cancelAnimationFrame: () => {},
      performance: { now: () => Date.now() },
      navigator: { clipboard: { writeText: async () => {} } },
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      document: {
        getElementById: () => makeEl(),
        querySelector: () => makeEl(),
        querySelectorAll: () => [],
        createElement: () => makeEl(),
        createDocumentFragment: () => ({ appendChild() {} }),
        body: makeEl(),
        addEventListener() {},
        activeElement: null
      }
    };
    sandbox.globalThis = sandbox;
    const context = vm.createContext(sandbox);
    vm.runInContext(UTILS, context, { filename: "utils.js" });
    return { sandbox, context };
  }

  test("helpers are exposed at global scope", () => {
    const { sandbox } = loadUtils();
    expect(typeof sandbox.openDialog).toBe("function");
    expect(typeof sandbox.closeDialog).toBe("function");
  });

  test("closeDialog is a safe no-op when no dialog is open", () => {
    const { sandbox } = loadUtils();
    expect(() => sandbox.closeDialog()).not.toThrow();
    expect(() => sandbox.closeDialog(makeEl())).not.toThrow();
  });

  test("openDialog focuses the requested initial element and openDialog without focusable elements is safe", () => {
    const { sandbox } = loadUtils();
    let focused = null;
    const overlay = {
      classList: { add() {}, remove() {} },
      addEventListener() {},
      removeEventListener() {},
      querySelector: () => ({ focus: () => { focused = "initial"; } }),
      querySelectorAll: () => []
    };
    sandbox.openDialog(overlay, { initialFocus: "#pf-name" });
    expect(focused).toBe("initial");
    // Closing restores focus to the previously focused element.
    sandbox.closeDialog(overlay);
  });
});

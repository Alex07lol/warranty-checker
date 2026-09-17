// Regression guard for the colour system in public/css/app.css.
//
// Every accent colour is used two ways — as *text* on its `-soft` tint (chips,
// stat icons, status badges) and as a *background* for `--on-accent` text
// (nav badge, active chip, toasts, buttons). Both roles have to clear WCAG AA,
// so these tests assert the token values themselves rather than trusting a
// screenshot to catch a palette regression later.
//
// The palette lives in two blocks: `:root` (light) and `body.dark-mode` (dark).
const fs = require("node:fs");
const path = require("node:path");

const CSS = fs.readFileSync(path.join(__dirname, "..", "public", "css", "app.css"), "utf8");

const AA = 4.5; // normal text; large text/icons only need 3:1, so this is stricter

function themeBlock(selector) {
  const start = CSS.indexOf(selector);
  if (start === -1) throw new Error("Palette block not found: " + selector);
  const block = CSS.slice(start, CSS.indexOf("}", start));
  const tokens = {};
  for (const m of block.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) tokens[m[1]] = m[2];
  const gradient = block.match(/--brand-grad:\s*([^;]+);/);
  if (gradient) {
    const stops = [...gradient[1].matchAll(/#[0-9a-fA-F]{6}/g)].map((s) => s[0]);
    stops.forEach((stop, i) => (tokens["--brand-grad-" + (i + 1)] = stop));
  }
  return tokens;
}

const themes = {
  light: themeBlock(":root {"),
  dark: themeBlock("body.dark-mode {")
};

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16));

function luminance(hex) {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Text sitting on a `-soft` tint: `.badge-safe`, `.stat-icon-wrapper.active`,
// `.coverage-status`, `.ocr-*`, `.doc-state-*`, `.login-prompt`, ...
const ON_SOFT = ["--ok", "--warn", "--danger", "--info", "--neutral", "--brand", "--brand-ink"];

// Solid accent surfaces rendered with `--on-accent` text: `.nav-badge`,
// `.reminder-day-chip.active`, `.toast.success`, `.toast.error`.
const SOLID = ["--ok", "--warn", "--danger", "--info", "--neutral", "--brand"];

// Gradient surfaces (`--brand-grad`) carry `--on-brand-grad` text: buttons,
// the active nav pill, the guest logout button.
const GRADIENT_STOPS = ["--brand-grad-1", "--brand-grad-2"];

const INK = ["--ink", "--ink-2", "--ink-3"];
const SURFACES = ["--surface", "--surface-2", "--surface-3", "--canvas"];

describe.each(Object.keys(themes))("%s theme palette", (name) => {
  const t = themes[name];
  const ratio = (fg, bg) => contrast(t[fg] || fg, t[bg] || bg);

  test("defines every colour the stylesheet references", () => {
    for (const token of [...ON_SOFT, ...SOLID, ...GRADIENT_STOPS, ...INK, ...SURFACES, "--on-accent", "--on-brand-grad"]) {
      expect(t[token]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  test("body ink clears AA on every surface", () => {
    for (const ink of INK) {
      for (const surface of SURFACES) {
        const value = +ratio(ink, surface).toFixed(2);
        if (value < AA) throw new Error(ink + " on " + surface + " is only " + value + ":1");
      }
    }
  });

  test("accent text clears AA on its soft tint", () => {
    for (const accent of ON_SOFT) {
      const soft = accent === "--brand-ink" ? "--brand-soft" : accent + "-soft";
      expect(t[soft]).toMatch(/^#[0-9a-fA-F]{6}$/);
      const value = +ratio(accent, soft).toFixed(2);
      if (value < AA) throw new Error(accent + " on " + soft + " is only " + value + ":1");
    }
  });

  test("on-accent text clears AA on solid accents", () => {
    for (const accent of SOLID) {
      const value = +ratio("--on-accent", accent).toFixed(2);
      if (value < AA) throw new Error("--on-accent on " + accent + " is only " + value + ":1");
    }
  });

  test("gradient text clears AA on every stop of the brand gradient", () => {
    for (const stop of GRADIENT_STOPS) {
      const value = +ratio("--on-brand-grad", stop).toFixed(2);
      if (value < AA) throw new Error("--on-brand-grad on " + stop + " is only " + value + ":1");
    }
  });
});

describe("dark theme overrides the light palette", () => {
  test("surfaces, ink and accents actually change", () => {
    for (const token of ["--canvas", "--surface", "--ink", "--ink-2", "--ink-3", "--brand-soft", "--ok", "--on-accent"]) {
      expect(themes.dark[token]).not.toBe(themes.light[token]);
    }
  });

  test("light theme paints on-accent text white, dark theme paints it dark", () => {
    expect(themes.light["--on-accent"]).toBe("#ffffff");
    expect(luminance(themes.dark["--on-accent"])).toBeLessThan(luminance(themes.dark["--brand"]));
  });
});

#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
   OCR CORPUS GENERATOR — renders the catalogue in scripts/ocr-corpus.cjs into
   real documents on disk: every capture type the app accepts.

     digital  a PDF with a real text layer (emailed invoices, PDF certificates)
     scan     the page rendered to pixels, then written BOTH as a PNG and as an
              image-only PDF with no text layer (so the rasterize + tesseract
              fallback in ocr.service is exercised, not bypassed)
     photo    a rotated / blurred / noisy / low-contrast / faded PNG, i.e. what
              a phone camera produces

   Usage:
     node scripts/ocr-corpus.mjs [--out .ocr-corpus] [--dpi 200] [--only <id>]

   The same module is imported by scripts/ocr-eval.mjs, so the evaluation and a
   manual `npm run ocr:corpus` render byte-identical files.
   ───────────────────────────────────────────────────────────────────────────── */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as mupdf from "mupdf";

const require = createRequire(import.meta.url);
const { DOCUMENTS, PAGE_SIZES, documentText } = require("./ocr-corpus.cjs");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.join(HERE, ".ocr-corpus");
// 150 dpi keeps the corpus quick to render and still gives tesseract ~3x the
// glyph detail of a 72 dpi page.
const DEFAULT_DPI = 150;

// ── text encoding (WinAnsi, what a simple PDF font can actually print) ───────
const WINANSI = {
  "£": 0xa3, "€": 0x80, "¥": 0xa5, "°": 0xb0, "©": 0xa9, "®": 0xae,
  "–": 0x96, "—": 0x97, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94,
  "•": 0x95, "§": 0xa7, "₹": 0x3f // ₹ has no WinAnsi slot: prints as "?"
};

// PDF string literals: `\` `(` `)` are escaped, and a character with no
// WinAnsi slot becomes an octal escape so the text layer holds the real glyph
// ("£" → escape → mupdf extracts "£" again). One pass, so an octal escape we
// emit is never re-escaped.
function encodeText(text) {
  let out = "";
  for (const ch of text) {
    if (ch === "\\" || ch === "(" || ch === ")") {
      out += "\\" + ch;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code >= 0x20 && code <= 0x7e) {
      out += ch;
      continue;
    }
    const mapped = WINANSI[ch];
    if (mapped === undefined || mapped === 0x3f) {
      out += "?";
    } else {
      out += "\\" + mapped.toString(8).padStart(3, "0");
    }
  }
  return out;
}

// Helvetica advance widths, in em, for the cases a broken metric query would
// otherwise get wrong. Asking the base-14 font for advances returns 0 in this
// mupdf build, and a 0-width measurement draws every right-aligned amount off
// the right edge of the page (where it is silently clipped away).
const EM_WIDTH = { " ": 0.278, ".": 0.278, ",": 0.278, ":": 0.278, ";": 0.278, "/": 0.278, "-": 0.333 };

function charWidth(ch, size) {
  if (EM_WIDTH[ch] !== undefined) return EM_WIDTH[ch] * size;
  if (ch >= "0" && ch <= "9") return 0.556 * size;
  return 0.5 * size;
}

function measure(font, text, size) {
  let width = 0;
  for (const ch of text) {
    let advance = 0;
    try {
      const gid = font.encodeCharacter(ch.codePointAt(0));
      if (gid) advance = font.advanceGlyph(gid, size);
    } catch {
      advance = 0;
    }
    width += advance > 0 ? advance : charWidth(ch, size);
  }
  return width;
}

// ── page layout ─────────────────────────────────────────────────────────────
const MARGIN = { letter: 56, a4: 56, roll: 12 };
const BASE_SIZE = { letter: 11, a4: 11, roll: 9 };

// Lay one catalogue page out into absolute text runs.
function layoutPage(doc, page, font, boldFont) {
  const [width, height] = PAGE_SIZES[doc.page];
  const margin = MARGIN[doc.page];
  const base = BASE_SIZE[doc.page];
  const runs = [];
  let y = height - margin;

  for (const line of page.lines) {
    if (line.gap) {
      y -= line.gap;
      continue;
    }
    const size = line.size || base;
    y -= size * 1.55;
    const selected = line.bold ? boldFont : font;
    if (line.row) {
      const cells = line.row;
      const xFor = (cell, index) => {
        if (cells.length === 1) {
          if (line.align === "center") return (width - measure(selected, cell, size)) / 2;
          if (line.align === "right") return width - margin - measure(selected, cell, size);
          return margin;
        }
        if (index === cells.length - 1) return width - margin - measure(selected, cell, size);
        if (index === 0) return margin;
        return (width - measure(selected, cell, size)) / 2;
      };
      cells.forEach((cell, index) => {
        runs.push({ text: cell, x: xFor(cell, index), y, size, bold: !!line.bold });
      });
      continue;
    }
    const text = line.text;
    const textWidth = measure(selected, text, size);
    let x = margin;
    if (line.align === "center") x = (width - textWidth) / 2;
    if (line.align === "right") x = width - margin - textWidth;
    runs.push({ text, x, y, size, bold: !!line.bold });
  }
  return runs;
}

function contentStream(runs) {
  return runs
    .map(
      (run) =>
        `BT /${run.bold ? "F2" : "F1"} ${run.size} Tf 1 0 0 1 ${run.x.toFixed(2)} ${run.y.toFixed(2)} Tm (${encodeText(run.text)}) Tj ET`
    )
    .join("\n");
}

// ── document builders ───────────────────────────────────────────────────────
export function buildTextPdf(doc) {
  const pdf = new mupdf.PDFDocument();
  const regular = new mupdf.Font("Helvetica");
  const bold = new mupdf.Font("Helvetica-Bold");
  const fontRef = pdf.addSimpleFont(regular, "Latin");
  const boldRef = pdf.addSimpleFont(bold, "Latin");
  const fonts = pdf.newDictionary();
  fonts.put("F1", fontRef);
  fonts.put("F2", boldRef);
  const resources = pdf.newDictionary();
  resources.put("Font", fonts);
  const [width, height] = PAGE_SIZES[doc.page];

  for (const page of doc.pages) {
    const runs = layoutPage(doc, page, regular, bold);
    const pageObj = pdf.addPage([0, 0, width, height], 0, resources, new TextEncoder().encode(contentStream(runs)));
    pdf.insertPage(-1, pageObj);
  }
  return pdf;
}

// A hand-filled warranty card: no script font is available to a base-14 PDF,
// so "handwriting" is modelled the way it challenges OCR — every glyph gets
// its own baseline offset and size wobble (people do not write on a ruler)
// and every line drifts a little (ruling lines are never straight). Layout is
// one character per Tj so the per-glyph transforms are possible.
function buildHandwrittenPdf(doc, seed = 42) {
  const random = mulberry32(seed);
  const pdf = new mupdf.PDFDocument();
  const regular = new mupdf.Font("Helvetica");
  const fontRef = pdf.addSimpleFont(regular, "Latin");
  const fonts = pdf.newDictionary();
  fonts.put("F1", fontRef);
  const resources = pdf.newDictionary();
  resources.put("Font", fonts);
  const [width, height] = PAGE_SIZES[doc.page];
  const margin = MARGIN[doc.page];
  const base = BASE_SIZE[doc.page];

  for (const page of doc.pages) {
    const runs = [];
    let y = height - margin;
    for (const line of page.lines) {
      if (line.gap) {
        y -= line.gap;
        continue;
      }
      const size = (line.size || base) * 1.15; // handwriting runs larger
      y -= size * 1.9;
      const lineDrift = (random() * 2 - 1) * 6; // the whole line wanders
      let x = margin + lineDrift + (random() * 2 - 1) * 3;
      for (const ch of line.text) {
        const cw = ch === " " ? 0.3 * size : measure(regular, ch, size);
        x += cw;
        if (ch === " ") continue;
        const jitterX = (random() * 2 - 1) * size * 0.08;
        const jitterY = (random() * 2 - 1) * size * 0.16; // baseline wander
        const glyphSize = size * (0.92 + random() * 0.16);
        runs.push({
          text: ch,
          x: x + jitterX,
          y: y + jitterY,
          size: glyphSize,
          bold: false
        });
        x += (random() * 2 - 1) * size * 0.06;
      }
    }
    const pageObj = pdf.addPage([0, 0, width, height], 0, resources, new TextEncoder().encode(contentStream(runs)));
    pdf.insertPage(-1, pageObj);
  }
  return pdf;
}

// `saveToBuffer` hands back a view into the WASM heap, and that heap can be
// detached the moment mupdf allocates again (opening the next document). Copy
// every buffer we intend to reuse into real Node memory first.
function toBytes(buffer) {
  return Buffer.from(buffer.asUint8Array());
}

// An image-only PDF, i.e. what a flatbed scanner produces: the scan is drawn
// onto a paper-sized page (letter / A4 / receipt roll) at its natural size, so
// the page geometry matches a real scan instead of a 1 px = 1 pt monster page.
function buildImagePdf(pages, pageSize = "letter") {
  const pdf = new mupdf.PDFDocument();
  const [pageWidth, pageHeight] = PAGE_SIZES[pageSize];
  for (const { pixels, width, height } of pages) {
    const image = pdf.newDictionary();
    image.put("Type", "XObject");
    image.put("Subtype", "Image");
    image.put("Width", width);
    image.put("Height", height);
    image.put("ColorSpace", "DeviceRGB");
    image.put("BitsPerComponent", 8);
    const stream = pdf.addStream(Buffer.from(pixels), image);
    const xobjects = pdf.newDictionary();
    xobjects.put("Im0", stream);
    const resources = pdf.newDictionary();
    resources.put("XObject", xobjects);
    // Fit the raster into the paper box, preserving aspect ratio.
    const scale = Math.min(pageWidth / width, pageHeight / height);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    const offsetX = (pageWidth - drawWidth) / 2;
    const offsetY = (pageHeight - drawHeight) / 2;
    const draw = `q ${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${offsetX.toFixed(2)} ${offsetY.toFixed(2)} cm /Im0 Do Q`;
    const pageObj = pdf.addPage([0, 0, pageWidth, pageHeight], 0, resources, new TextEncoder().encode(draw));
    pdf.insertPage(-1, pageObj);
  }
  return pdf;
}

// ── raster degradation (what a camera or a scanner does to the page) ────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

function rotate(pixels, width, height, degrees) {
  if (!degrees) return pixels;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const out = new Uint8Array(pixels.length);
  const cx = width / 2;
  const cy = height / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const sx = Math.round(cos * dx + sin * dy + cx);
      const sy = Math.round(-sin * dx + cos * dy + cy);
      const target = (y * width + x) * 3;
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) {
        out[target] = 255;
        out[target + 1] = 255;
        out[target + 2] = 255;
        continue;
      }
      const source = (sy * width + sx) * 3;
      out[target] = pixels[source];
      out[target + 1] = pixels[source + 1];
      out[target + 2] = pixels[source + 2];
    }
  }
  return out;
}

function boxBlur(pixels, width, height, radius) {
  if (!radius) return pixels;
  const pass = (src, horizontal) => {
    const out = new Uint8Array(src.length);
    const outer = horizontal ? height : width;
    const inner = horizontal ? width : height;
    for (let o = 0; o < outer; o += 1) {
      for (let i = 0; i < inner; i += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const j = i + k;
          if (j < 0 || j >= inner) continue;
          const index = horizontal ? (o * width + j) * 3 : (j * width + o) * 3;
          r += src[index];
          g += src[index + 1];
          b += src[index + 2];
          n += 1;
        }
        const index = horizontal ? (o * width + i) * 3 : (i * width + o) * 3;
        out[index] = r / n;
        out[index + 1] = g / n;
        out[index + 2] = b / n;
      }
    }
    return out;
  };
  return pass(pass(pixels, true), false);
}

// Thermal paper passes over a worn platen / curled edge: narrow horizontal
// bands of the print come out lighter or slightly displaced. Implemented as a
// per-row luminance wobble plus a slow vertical stretch wobble, which is what
// a curled roll photograph actually shows.
function thermalCurl(pixels, width, height, strength, seed) {
  const random = mulberry32(seed);
  // A few slow sine waves in band phase + a fast per-row jitter.
  const waves = Array.from({ length: 3 }, () => ({
    period: 12 + Math.floor(random() * 30),
    phase: random() * Math.PI * 2,
    amp: (0.25 + random() * 0.75) * strength
  }));
  const out = new Uint8Array(pixels.length);
  for (let y = 0; y < height; y += 1) {
    let band = 0;
    for (const w of waves) band += Math.sin((y / w.period) * Math.PI * 2 + w.phase) * w.amp;
    const lift = band * 140; // lighten dark ink inside the band
    const shift = Math.round(band * 1.6); // small horizontal displacement
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(width - 1, Math.max(0, x + shift));
      const target = (y * width + x) * 3;
      const source = (y * width + sx) * 3;
      for (let c = 0; c < 3; c += 1) {
        const v = pixels[source + c];
        // Only ink (dark pixels) is lifted; white paper stays paper.
        out[target + c] = clamp8(v + lift * (1 - v / 255));
      }
    }
  }
  return out;
}

function degrade(pixels, width, height, options = {}, seed = 1) {
  const random = mulberry32(seed);
  let out = rotate(pixels, width, height, options.rotate);
  out = boxBlur(out, width, height, options.blur);
  if (options.thermalCurl) out = thermalCurl(out, width, height, options.thermalCurl, seed + 7);
  if (options.rollSkew) out = rollSkew(out, width, height, options.rollSkew, seed + 13);
  const contrast = options.contrast;
  const faded = options.faded;
  const noise = options.noise;
  for (let i = 0; i < out.length; i += 3) {
    for (let c = 0; c < 3; c += 1) {
      let v = out[i + c];
      if (faded) v = 255 - (255 - v) * faded;
      if (contrast !== undefined) v = 128 + (v - 128) * contrast;
      if (noise) v += (random() * 2 - 1) * noise;
      out[i + c] = clamp8(v);
    }
  }
  return out;
}

// A misfed thermal roll prints each line a little further sideways than the
// last — a progressive horizontal shear ("vertical skew"). Rows keep their
// content; only the x offset grows with y, so text stays legible but every
// line lands at a different indent.
function rollSkew(pixels, width, height, maxShift, seed) {
  const random = mulberry32(seed);
  const drift = (random() < 0.5 ? -1 : 1) * (0.4 + random() * 0.6) * maxShift;
  const wobble = (random() * 2 - 1) * maxShift * 0.15;
  const out = new Uint8Array(pixels.length);
  out.fill(255);
  for (let y = 0; y < height; y += 1) {
    const shift = Math.round((drift * y) / height + wobble);
    for (let x = 0; x < width; x += 1) {
      const sx = x - shift;
      if (sx < 0 || sx >= width) continue;
      const target = (y * width + x) * 3;
      const source = (y * width + sx) * 3;
      out[target] = pixels[source];
      out[target + 1] = pixels[source + 1];
      out[target + 2] = pixels[source + 2];
    }
  }
  return out;
}

function pixmapPixels(pixmap) {
  const width = pixmap.getWidth();
  const height = pixmap.getHeight();
  const source = pixmap.getPixels();
  const rowBytes = width * 3;
  // Repack to a tightly packed RGB buffer (mupdf pads rows to a stride).
  const packed = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    const from = y * pixmap.getStride();
    packed.set(source.subarray(from, from + rowBytes), y * rowBytes);
  }
  pixmap.destroy();
  return { pixels: packed, width, height };
}

function renderPagePixels(page, scale) {
  return pixmapPixels(page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, false));
}

// ── corpus generation ───────────────────────────────────────────────────────
// A phone camera puts far more pixels on a page than a 150 dpi scan does, so
// photo captures are rendered denser — otherwise the corpus would test the
// downsampling of our own renderer instead of the OCR engine.
const PHOTO_DPI_BOOST = 1.7;

export function generateCorpus({ outDir = DEFAULT_OUT, dpi = DEFAULT_DPI, only } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const scale = dpi / 72;
  const photoScale = scale * PHOTO_DPI_BOOST;
  const manifest = { dpi, generatedAt: new Date().toISOString(), documents: [] };

  for (const doc of DOCUMENTS) {
    if (only && doc.id !== only) continue;
    const dir = path.join(outDir, doc.id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });

    const entry = {
      id: doc.id,
      label: doc.label,
      documentType: doc.documentType,
      fileName: doc.fileName,
      capture: doc.capture,
      empty: !!doc.empty,
      text: documentText(doc),
      pageText: doc.pages.map((_, index) => documentText(doc, index)),
      expected: doc.expected,
      files: []
    };

    if (doc.capture === "digital") {
      const file = path.join(dir, doc.fileName);
      fs.writeFileSync(file, toBytes(buildTextPdf(doc).saveToBuffer("compress")));
      entry.files.push({ path: path.relative(outDir, file), name: doc.fileName, mimeType: "application/pdf" });
    } else {
      const textPdf =
        doc.capture === "handwritten" ? buildHandwrittenPdf(doc, 17 + doc.id.length) : buildTextPdf(doc);
      const rendered = [];
      const source = mupdf.Document.openDocument(toBytes(textPdf.saveToBuffer("compress")), "application/pdf");
      for (let i = 0; i < doc.pages.length; i += 1) {
        const page = source.loadPage(i);
        const raster = renderPagePixels(page, doc.capture === "photo" ? photoScale : scale);
        const degraded = degrade(raster.pixels, raster.width, raster.height, doc.degrade, i + doc.id.length);
        rendered.push({ pixels: degraded, width: raster.width, height: raster.height });
        page.destroy();
      }

      const captureName = doc.capture === "scan" ? "scan" : doc.capture;
      const pngName = doc.fileName.endsWith(".pdf")
        ? doc.fileName.replace(/\.pdf$/, `-${captureName}.png`)
        : doc.fileName;
      if (doc.files.includes("png")) {
        const pngFile = path.join(dir, pngName);
        const png = toBytes(buildImagePdf([rendered[0]], doc.page).saveToBuffer("compress"));
        const reopened = mupdf.Document.openDocument(png, "application/pdf");
        const page = reopened.loadPage(0);
        // Re-render at the raster's own resolution. Rendering at identity would
        // resample the capture down to 72 dpi (1 px per point) and the "photo"
        // would reach OCR unreadably small.
        const [boxWidth] = PAGE_SIZES[doc.page];
        const nativeScale = rendered[0].width / boxWidth;
        const pixmap = page.toPixmap(
          mupdf.Matrix.scale(nativeScale, nativeScale),
          mupdf.ColorSpace.DeviceRGB,
          false,
          false
        );
        fs.writeFileSync(pngFile, Buffer.from(pixmap.asPNG()));
        pixmap.destroy();
        page.destroy();
        entry.files.push({ path: path.relative(outDir, pngFile), name: pngName, mimeType: "image/png" });
      }
      if (doc.files.includes("pdf")) {
        const pdfName = doc.fileName.endsWith(".pdf") ? doc.fileName : doc.fileName.replace(/\.[^.]+$/, ".pdf");
        const pdfFile = path.join(dir, pdfName);
        fs.writeFileSync(pdfFile, toBytes(buildImagePdf(rendered, doc.page).saveToBuffer("compress")));
        entry.files.push({ path: path.relative(outDir, pdfFile), name: pdfName, mimeType: "application/pdf" });
      }
    }

    manifest.documents.push(entry);
  }

  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { out: DEFAULT_OUT, dpi: DEFAULT_DPI, only: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") args.out = path.resolve(argv[++i]);
    else if (argv[i] === "--dpi") args.dpi = Number(argv[++i]);
    else if (argv[i] === "--only") args.only = argv[++i];
  }
  return args;
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const manifest = generateCorpus(args);
  let files = 0;
  let bytes = 0;
  for (const doc of manifest.documents) {
    for (const file of doc.files) {
      files += 1;
      bytes += fs.statSync(path.join(args.out, file.path)).size;
    }
  }
  process.stdout.write(
    `Rendered ${manifest.documents.length} documents (${files} files, ${(bytes / 1024).toFixed(1)} KiB) at ${args.dpi} dpi into ${args.out}\n`
  );
  for (const doc of manifest.documents) {
    process.stdout.write(`  ${doc.id.padEnd(32)} ${doc.capture.padEnd(8)} ${doc.files.map((f) => f.name).join(", ")}\n`);
  }
}

#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
   OCR EVALUATION — runs the REAL pipeline over the synthetic corpus and scores
   every field it extracts against the ground truth.

   This is not a parser unit test: the documents are genuine PDFs and PNGs, the
   text comes out of tesseract (or out of the PDF text layer), and the fields
   are produced by the same code path production uses (extractDocumentData).
   A field only counts as extracted if a user would see the right value.

   Usage:
     node scripts/ocr-eval.mjs               # render the corpus, then score
     node scripts/ocr-eval.mjs --reuse       # score the existing render
     node scripts/ocr-eval.mjs --only <id>   # one document
     node scripts/ocr-eval.mjs --min 0.95    # allowed field accuracy (default 1)
     node scripts/ocr-eval.mjs --json        # machine-readable summary
   ───────────────────────────────────────────────────────────────────────────── */
// The evaluation never touches Mongo, Cloudinary or the HTTP layer, so it runs
// with the same test defaults the jest suites use (config/env.js fills them in
// when NODE_ENV=test). Must be set before the service module is required.
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { generateCorpus } from "./ocr-corpus.mjs";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { DOCUMENTS, SCORED_FIELDS } = require("./ocr-corpus.cjs");
const ocrService = require("../src/services/ocr.service.js");

const DEFAULT_OUT = path.join(HERE, ".ocr-corpus");

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT, dpi: 150, only: undefined, min: 1, reuse: false, json: false, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--out") args.out = path.resolve(argv[++i]);
    else if (flag === "--dpi") args.dpi = Number(argv[++i]);
    else if (flag === "--only") args.only = argv[++i];
    else if (flag === "--min") args.min = Number(argv[++i]);
    else if (flag === "--reuse") args.reuse = true;
    else if (flag === "--json") args.json = true;
    else if (flag === "--quiet") args.quiet = true;
  }
  return args;
}

const pad = (n) => String(n).padStart(2, "0");
// Local calendar date — ISO strings shift a day on positive-offset timezones.
const dstr = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function normalise(field, value) {
  if (value === undefined || value === null) return null;
  if (field === "purchaseDate" || field === "warrantyExpiryDate") return dstr(value);
  if (field === "purchasePrice") return Number(value);
  return String(value).trim();
}

const short = (text, max = 240) => {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

function scoreDocument(doc, parsed) {
  const results = [];
  for (const field of SCORED_FIELDS) {
    if (!(field in doc.expected)) continue;
    const want = normalise(field, doc.expected[field]);
    const got = normalise(field, parsed[field]);
    results.push({ field, want, got, pass: got === want });
  }
  return results;
}

// Recognise a document the way production does: PDFs go through the text-layer
// first / rasterize+tesseract fallback, images straight through tesseract.
async function recognise(filePath, file, documentType) {
  const buffer = fs.readFileSync(filePath);
  const started = Date.now();
  const { text, parsed } = await ocrService.extractDocumentData(buffer, {
    mimeType: file.mimeType,
    fileName: file.name,
    documentType
  });
  return { text, parsed, durationMs: Date.now() - started };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.join(args.out, "manifest.json");
  let manifest;
  if (args.reuse && fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } else {
    if (!args.quiet) process.stdout.write(`Rendering corpus into ${args.out} …\n`);
    manifest = generateCorpus({ outDir: args.out, dpi: args.dpi, only: args.only });
  }

  const documents = manifest.documents.filter((d) => !args.only || d.id === args.only);
  const report = {
    corpus: { out: args.out, dpi: manifest.dpi, documents: documents.length },
    fields: {},
    documents: [],
    failures: []
  };

  for (const doc of documents) {
    for (const file of doc.files) {
      const entry = { id: doc.id, file: file.name, mimeType: file.mimeType, fields: [] };
      try {
        const result = await recognise(path.join(args.out, file.path), file, doc.documentType);
        const fields = scoreDocument(doc, result.parsed);
        entry.fields = fields;
        entry.text = result.text;
        entry.durationMs = result.durationMs;
        entry.parsed = Object.fromEntries(
          SCORED_FIELDS.map((field) => [field, normalise(field, result.parsed[field])])
        );
        for (const field of fields) {
          report.fields[field.field] = report.fields[field.field] || { pass: 0, total: 0 };
          report.fields[field.field].total += 1;
          if (field.pass) report.fields[field.field].pass += 1;
          if (!field.pass) {
            report.failures.push({
              id: doc.id,
              file: file.name,
              field: field.field,
              got: field.got,
              want: field.want
            });
          }
        }
      } catch (error) {
        entry.error = error.message;
        report.failures.push({ id: doc.id, file: file.name, field: "<ocr>", got: error.message, want: "no error" });
      }
      report.documents.push(entry);

      if (!args.quiet && !args.json) {
        const checks = entry.fields.length;
        const passed = entry.fields.filter((f) => f.pass).length;
        const status = entry.error ? "ERROR" : passed === checks ? "PASS " : "FAIL ";
        process.stdout.write(`${status} ${doc.id.padEnd(32)} ${file.name.padEnd(34)} ${passed}/${checks} fields  ${entry.durationMs || 0}ms\n`);
        if (entry.error) {
          process.stdout.write(`      ocr error: ${entry.error}\n`);
        }
        for (const field of entry.fields.filter((f) => !f.pass)) {
          process.stdout.write(`      ${field.field.padEnd(20)} got ${JSON.stringify(field.got)} want ${JSON.stringify(field.want)}\n`);
        }
        if (entry.fields.some((f) => !f.pass)) {
          process.stdout.write(`      text: ${short(entry.text, 360)}\n`);
        }
      }
    }
  }

  const total = report.failures.length + Object.values(report.fields).reduce((sum, f) => sum + f.pass, 0);
  const passed = Object.values(report.fields).reduce((sum, f) => sum + f.pass, 0);
  report.totals = { pass: passed, total, accuracy: total ? passed / total : 0 };

  fs.writeFileSync(path.join(args.out, "eval-report.json"), JSON.stringify(report, null, 2));

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report.totals)}\n`);
  } else {
    process.stdout.write(`\nPer-field accuracy\n${"-".repeat(46)}\n`);
    for (const field of SCORED_FIELDS) {
      const stats = report.fields[field] || { pass: 0, total: 0 };
      const pct = stats.total ? ((stats.pass / stats.total) * 100).toFixed(0).padStart(3) : "  -";
      process.stdout.write(`  ${field.padEnd(20)} ${pct}%  (${stats.pass}/${stats.total})\n`);
    }
    process.stdout.write(`${"-".repeat(46)}\n`);
    process.stdout.write(
      `TOTAL ${passed}/${total} field checks passed (${(report.totals.accuracy * 100).toFixed(1)}%)\n`
    );
    if (report.failures.length) {
      process.stdout.write(`\n${report.failures.length} failing checks — see ${path.join(args.out, "eval-report.json")}\n`);
    }
  }

  process.exit(report.totals.accuracy >= args.min ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`ocr-eval failed: ${error.stack || error.message}\n`);
  process.exit(2);
});

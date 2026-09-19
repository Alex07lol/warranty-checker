"use strict";

/**
 * RFC 4180 compliant CSV parser.
 * Handles:
 * - Quoted fields with commas, newlines, and escaped quotes ("")
 * - UTF-8 encoding and BOM removal
 * - Empty fields and whitespace
 * - Preserves 1-indexed source row numbers (Row 1 = headers, Row 2+ = data)
 */
function parseCsv(input) {
  if (typeof input !== "string") {
    if (Buffer.isBuffer(input)) {
      input = input.toString("utf-8");
    } else {
      throw new TypeError("CSV input must be a string or Buffer");
    }
  }

  // Strip UTF-8 BOM if present
  if (input.charCodeAt(0) === 0xfeff) {
    input = input.slice(1);
  }

  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;
  let rowNumber = 1;
  let fieldStartRowNumber = 1;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const nextChar = input[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i++; // skip second quote
        } else {
          // Closing quote
          inQuotes = false;
        }
      } else {
        if (char === "\n") {
          rowNumber++;
        }
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentField);
        currentField = "";
      } else if (char === "\r") {
        if (nextChar === "\n") {
          i++; // skip \n
        }
        currentRow.push(currentField);
        currentField = "";
        rows.push({ rowNumber: fieldStartRowNumber, fields: currentRow });
        currentRow = [];
        rowNumber++;
        fieldStartRowNumber = rowNumber;
      } else if (char === "\n") {
        currentRow.push(currentField);
        currentField = "";
        rows.push({ rowNumber: fieldStartRowNumber, fields: currentRow });
        currentRow = [];
        rowNumber++;
        fieldStartRowNumber = rowNumber;
      } else {
        currentField += char;
      }
    }
  }

  // Flush remaining field/row
  if (currentField !== "" || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push({ rowNumber: fieldStartRowNumber, fields: currentRow });
  }

  // Filter out completely blank lines
  const nonEmptyRows = rows.filter((r) => r.fields.some((f) => f.trim() !== ""));

  if (nonEmptyRows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headerRow = nonEmptyRows[0];
  const headers = headerRow.fields.map((h) => h.trim());

  const dataRows = [];
  for (let r = 1; r < nonEmptyRows.length; r++) {
    const row = nonEmptyRows[r];
    const rawRecord = {};
    for (let h = 0; h < headers.length; h++) {
      const headerKey = headers[h] || `column_${h + 1}`;
      rawRecord[headerKey] = row.fields[h] !== undefined ? row.fields[h] : "";
    }
    dataRows.push({
      sourceRowNumber: row.rowNumber,
      rawRecord
    });
  }

  return {
    headers,
    rows: dataRows
  };
}

/**
 * Parses JSON array of records.
 */
function parseJson(input) {
  let data;
  if (typeof input === "string") {
    data = JSON.parse(input);
  } else if (Buffer.isBuffer(input)) {
    data = JSON.parse(input.toString("utf-8"));
  } else {
    data = input;
  }

  const records = Array.isArray(data) ? data : [data];
  const headerSet = new Set();
  records.forEach((r) => {
    if (r && typeof r === "object") {
      Object.keys(r).forEach((k) => headerSet.add(k));
    }
  });
  const headers = Array.from(headerSet);

  const rows = records.map((record, index) => ({
    sourceRowNumber: index + 1,
    rawRecord: record && typeof record === "object" ? record : { value: record }
  }));

  return { headers, rows };
}

/**
 * Auto-detect and parse input.
 */
function parseSource(input, formatHint = "csv") {
  const content = Buffer.isBuffer(input) ? input.toString("utf-8") : String(input || "");
  const trimmed = content.trim();

  if (formatHint === "json" || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return { ...parseJson(trimmed), sourceFormat: "json" };
    } catch {
      // Fallback to CSV if JSON parsing fails
    }
  }

  return { ...parseCsv(content), sourceFormat: "csv" };
}

module.exports = {
  parseCsv,
  parseJson,
  parseSource
};

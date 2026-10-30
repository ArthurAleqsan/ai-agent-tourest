/**
 * Minimal, dependency-free CSV parser (RFC-4180-ish).
 *
 * Supports quoted fields, escaped quotes (""), embedded commas/newlines, and
 * both LF and CRLF line endings. Kept tiny to preserve the project's $0-cost,
 * Node-18 constraints (no third-party CSV library).
 */

/** Parse CSV text into a matrix of string cells. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = input.length;

  const endField = (): void => {
    row.push(field);
    field = "";
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = input[i] as string;

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      endField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      // Swallow CR; the following LF (if any) triggers the row end.
      if (input[i + 1] === "\n") {
        endRow();
        i += 2;
      } else {
        endRow();
        i += 1;
      }
      continue;
    }
    if (ch === "\n") {
      endRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // Flush trailing field/row unless input ended exactly on a row break.
  if (field.length > 0 || row.length > 0) {
    endRow();
  }

  // Drop a single trailing empty row produced by a final newline.
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/**
 * Parse CSV with a header row into record objects keyed by (trimmed) header.
 * Header matching is case-insensitive via `normalizeHeader`.
 */
export function parseCsvRecords(
  input: string,
): Array<Record<string, string>> {
  const matrix = parseCsv(input);
  if (matrix.length === 0) return [];

  const headers = (matrix[0] as string[]).map((h) => normalizeHeader(h));
  const records: Array<Record<string, string>> = [];

  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r] as string[];
    const record: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      record[headers[c] as string] = (cells[c] ?? "").trim();
    }
    records.push(record);
  }
  return records;
}

export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

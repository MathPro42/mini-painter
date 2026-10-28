import type { SheetRows } from './sheetRows';

const DELIMITERS = [',', ';', '\t'] as const;

/**
 * Parses delimited text (RFC 4180 quoting, any line ending). The delimiter
 * is the most common of comma, semicolon and tab on the first non-blank line,
 * so files saved by spreadsheets in any locale read the same. Malformed
 * quoting is read leniently rather than rejected.
 */
export function parseCsv(text: string): SheetRows {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let index = 0;
  while (index < text.length) {
    const cell = readCell(text, index, delimiter);
    row.push(cell.value);
    index = cell.end;
    if (text.charAt(index) === delimiter) {
      index += 1;
    } else {
      rows.push(row);
      row = [];
      index += text.startsWith('\r\n', index) ? 2 : 1;
    }
  }
  if (row.length > 0) {
    // The text ended right after a delimiter, so the row's last cell is empty.
    rows.push([...row, '']);
  }
  return rows;
}

interface Cell {
  readonly value: string;
  /** Index of the delimiter or line break after the cell, or the text length. */
  readonly end: number;
}

function readCell(text: string, start: number, delimiter: string): Cell {
  if (text.charAt(start) !== '"') {
    let end = start;
    while (end < text.length && !isCellEnd(text.charAt(end), delimiter)) {
      end += 1;
    }
    return { value: text.slice(start, end), end };
  }
  let value = '';
  let index = start + 1;
  for (;;) {
    const quote = text.indexOf('"', index);
    if (quote === -1) {
      return { value: value + text.slice(index), end: text.length };
    }
    value += text.slice(index, quote);
    if (text.charAt(quote + 1) !== '"') {
      // Closing quote. Anything up to the next delimiter still belongs to the cell.
      const rest = readCell(text, quote + 1, delimiter);
      return { value: value + rest.value, end: rest.end };
    }
    value += '"';
    index = quote + 2;
  }
}

function isCellEnd(char: string, delimiter: string): boolean {
  return char === delimiter || char === '\n' || char === '\r';
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r\n|\n|\r/).find((line) => line.trim() !== '') ?? '';
  // Commas inside "rgb(1, 2, 3)" are not separators, even when unquoted.
  const outsideParentheses = firstLine.replace(/\([^)]*\)/g, '');
  let best: string = DELIMITERS[0];
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    const count = outsideParentheses.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

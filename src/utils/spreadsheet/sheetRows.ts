/** Rows of cell text from one sheet, top to bottom. Missing cells are `''`. */
export type SheetRows = readonly (readonly string[])[];

/** Cells below this row or right of this column are ignored. Palettes are far smaller. */
export const MAX_SHEET_ROWS = 10_000;
export const MAX_SHEET_COLUMNS = 256;

/** Collects cells that arrive in any order (as in xlsx and xls files) into SheetRows. */
export interface SheetBuilder {
  /** Stores a cell by zero-based position. Out-of-range positions are ignored. */
  set: (row: number, column: number, value: string) => void;
  rows: () => SheetRows;
}

export function createSheetBuilder(): SheetBuilder {
  const byRow = new Map<number, string[]>();
  let rowCount = 0;
  return {
    set: (row, column, value) => {
      if (!isIndex(row, MAX_SHEET_ROWS) || !isIndex(column, MAX_SHEET_COLUMNS)) {
        return;
      }
      let cells = byRow.get(row);
      if (cells === undefined) {
        cells = [];
        byRow.set(row, cells);
      }
      while (cells.length < column) {
        cells.push('');
      }
      cells[column] = value;
      rowCount = Math.max(rowCount, row + 1);
    },
    rows: () => Array.from({ length: rowCount }, (_, row) => byRow.get(row) ?? []),
  };
}

function isIndex(value: number, limit: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < limit;
}

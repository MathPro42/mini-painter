import { describe, expect, it } from 'vitest';
import { createSheetBuilder, MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from './sheetRows';

describe('createSheetBuilder', () => {
  it('collects cells given in any order, padding gaps with empty cells', () => {
    const builder = createSheetBuilder();
    builder.set(2, 1, 'c');
    builder.set(0, 0, 'a');
    builder.set(2, 0, 'b');
    builder.set(0, 0, 'A');
    expect(builder.rows()).toEqual([['A'], [], ['b', 'c']]);
  });

  it('ignores positions outside the sheet limits', () => {
    const builder = createSheetBuilder();
    builder.set(-1, 0, 'negative');
    builder.set(0, 1.5, 'fraction');
    builder.set(MAX_SHEET_ROWS, 0, 'too low');
    builder.set(0, MAX_SHEET_COLUMNS, 'too far right');
    expect(builder.rows()).toEqual([]);
  });
});

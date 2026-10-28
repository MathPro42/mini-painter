import { sliceBytes, viewOf } from './bytes';
import { createBiffReader, readSharedStringTable } from './biffStrings';
import { createSheetBuilder } from './sheetRows';
import type { SheetBuilder, SheetRows } from './sheetRows';

// BIFF8 ([MS-XLS]) is the record stream inside an Excel 97–2003 workbook:
// a globals substream (sheet list, shared strings) and one substream per sheet.

const BOF = 0x0809;
const EOF = 0x000a;
const FILEPASS = 0x002f;
const BOUNDSHEET = 0x0085;
const SST = 0x00fc;
const CONTINUE = 0x003c;
const BIFF8 = 0x0600;
const WORKSHEET = 0x00;

interface BiffRecord {
  readonly type: number;
  readonly data: Uint8Array;
  /** Offset of the record after this one. */
  readonly next: number;
}

interface SheetContext {
  readonly builder: SheetBuilder;
  readonly strings: readonly string[];
  /** A formula whose text result arrives in the next STRING record. */
  pendingFormula: { readonly row: number; readonly column: number } | null;
}

/**
 * Reads the cell text of the first worksheet in a BIFF8 workbook stream.
 * Throws a RangeError for older BIFF versions, encrypted files and corrupt data.
 */
export function readBiffFirstSheet(stream: Uint8Array): SheetRows {
  const { sheetOffset, strings } = readGlobals(stream);
  return readSheet(stream, sheetOffset, strings);
}

function readGlobals(stream: Uint8Array): { sheetOffset: number; strings: string[] } {
  let record = readRecord(stream, 0);
  if (record.type !== BOF || record.data.byteLength < 2 || u16(record.data, 0) !== BIFF8) {
    throw new RangeError('Only Excel 97 and later .xls files are supported');
  }
  let sheetOffset: number | null = null;
  let strings: string[] = [];
  while (record.type !== EOF) {
    record = readRecord(stream, record.next);
    if (record.type === FILEPASS) {
      throw new RangeError('The workbook is password-protected');
    } else if (record.type === BOUNDSHEET) {
      sheetOffset ??= worksheetOffset(record.data);
    } else if (record.type === SST) {
      const { segments, last } = readContinued(stream, record);
      strings = readSharedStringTable(segments);
      record = last;
    }
  }
  if (sheetOffset === null) {
    throw new RangeError('The workbook has no worksheet');
  }
  return { sheetOffset, strings };
}

/** Collects a record's data and that of the CONTINUE records after it. */
function readContinued(
  stream: Uint8Array,
  first: BiffRecord,
): { segments: Uint8Array[]; last: BiffRecord } {
  const segments = [first.data];
  let last = first;
  for (let next = readRecord(stream, first.next); next.type === CONTINUE;) {
    segments.push(next.data);
    last = next;
    next = readRecord(stream, next.next);
  }
  return { segments, last };
}

/** Stream offset of a BOUNDSHEET record's sheet, or `null` for charts and macro sheets. */
function worksheetOffset(data: Uint8Array): number | null {
  return data.byteLength >= 6 && data[5] === WORKSHEET ? viewOf(data).getUint32(0, true) : null;
}

function readRecord(stream: Uint8Array, offset: number): BiffRecord {
  const header = viewOf(sliceBytes(stream, offset, 4, 'record'));
  const size = header.getUint16(2, true);
  return {
    type: header.getUint16(0, true),
    data: sliceBytes(stream, offset + 4, size, 'record'),
    next: offset + 4 + size,
  };
}

function readSheet(stream: Uint8Array, offset: number, strings: readonly string[]): SheetRows {
  const context: SheetContext = { builder: createSheetBuilder(), strings, pendingFormula: null };
  let record = readRecord(stream, offset);
  if (record.type !== BOF) {
    throw new RangeError('The file is truncated or corrupt (worksheet)');
  }
  while (record.type !== EOF) {
    record = readRecord(stream, record.next);
    const read = CELL_READERS.get(record.type);
    try {
      read?.(record.data, context);
    } catch {
      // Cell readers only fail by reading past a record shorter than its type requires.
      throw new RangeError('The file is truncated or corrupt (cell)');
    }
  }
  return context.builder.rows();
}

type CellReader = (data: Uint8Array, context: SheetContext) => void;

// Every cell record starts with its zero-based row and column (2 bytes each)
// and a 2-byte format index, so values start at offset 6.
const CELL_READERS: ReadonlyMap<number, CellReader> = new Map<number, CellReader>([
  [0x00fd, readLabelSst],
  [0x0204, readLabel],
  [0x00d6, readLabel], // RSTRING: a LABEL with formatting runs after the text.
  [0x0203, readNumber],
  [0x027e, readRk],
  [0x00bd, readMulRk],
  [0x0205, readBoolErr],
  [0x0006, readFormula],
  [0x0207, readFormulaString],
]);

/** LABELSST: an index into the shared string table. */
function readLabelSst(data: Uint8Array, { builder, strings }: SheetContext): void {
  setCell(builder, data, strings[viewOf(data).getUint32(6, true)] ?? '');
}

/** LABEL: a string stored in the cell record itself. */
function readLabel(data: Uint8Array, { builder }: SheetContext): void {
  setCell(builder, data, readCellString(data.subarray(6)));
}

function readNumber(data: Uint8Array, { builder }: SheetContext): void {
  setCell(builder, data, String(viewOf(data).getFloat64(6, true)));
}

/** RK: a number squeezed into 4 bytes. */
function readRk(data: Uint8Array, { builder }: SheetContext): void {
  setCell(builder, data, String(decodeRk(viewOf(data).getUint32(6, true))));
}

/** MULRK: a run of RK cells in one row; each is a 2-byte format index and a 4-byte RK. */
function readMulRk(data: Uint8Array, { builder }: SheetContext): void {
  const view = viewOf(data);
  const row = view.getUint16(0, true);
  const first = view.getUint16(2, true);
  // 4 bytes of row and first column, 6 per cell, then 2 bytes of last column.
  const count = Math.floor((data.byteLength - 6) / 6);
  for (let index = 0; index < count; index += 1) {
    builder.set(row, first + index, String(decodeRk(view.getUint32(6 + index * 6, true))));
  }
}

/** BOOLERR: a boolean, or an error value (read as an empty cell). */
function readBoolErr(data: Uint8Array, { builder }: SheetContext): void {
  if (data[7] === 0) {
    setCell(builder, data, data[6] === 0 ? 'FALSE' : 'TRUE');
  }
}

/** FORMULA: only the cached result matters. Its 8 bytes hold a number unless the last two are 0xFFFF. */
function readFormula(data: Uint8Array, context: SheetContext): void {
  const view = viewOf(data);
  if (view.getUint16(12, true) !== 0xffff) {
    setCell(context.builder, data, String(view.getFloat64(6, true)));
  } else if (data[6] === 0) {
    context.pendingFormula = { row: view.getUint16(0, true), column: view.getUint16(2, true) };
  } else if (data[6] === 1) {
    setCell(context.builder, data, data[8] === 0 ? 'FALSE' : 'TRUE');
  }
}

/** STRING: the text result of the formula just before it. */
function readFormulaString(data: Uint8Array, context: SheetContext): void {
  const cell = context.pendingFormula;
  if (cell !== null) {
    context.builder.set(cell.row, cell.column, readCellString(data));
    context.pendingFormula = null;
  }
}

function setCell(builder: SheetBuilder, data: Uint8Array, value: string): void {
  builder.set(u16(data, 0), u16(data, 2), value);
}

function u16(data: Uint8Array, offset: number): number {
  return viewOf(data).getUint16(offset, true);
}

/** Reads an XLUnicodeString: a 2-byte length, an option byte, then the characters. */
function readCellString(bytes: Uint8Array): string {
  const reader = createBiffReader([bytes]);
  const length = reader.u16();
  return reader.chars(length, (reader.u8() & 0x01) !== 0);
}

/**
 * Decodes an RK number: 30 significant bits that are either a signed integer
 * or the top of an IEEE double, divided by 100 when the lowest bit is set.
 */
export function decodeRk(rk: number): number {
  let value: number;
  if ((rk & 0x02) !== 0) {
    value = rk >> 2;
  } else {
    const view = new DataView(new ArrayBuffer(8));
    view.setUint32(4, rk & 0xfffffffc, true);
    value = view.getFloat64(0, true);
  }
  return (rk & 0x01) !== 0 ? value / 100 : value;
}

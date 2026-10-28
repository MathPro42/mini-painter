import { describe, expect, it } from 'vitest';
import xlsFixture from './fixtures/palette.xls?inline';
import { decodeRk, readBiffFirstSheet } from './biff';
import { readCfbStream } from './cfb';

const u16 = (value: number): number[] => [value & 0xff, (value >> 8) & 0xff];
const u32 = (value: number): number[] => [...u16(value & 0xffff), ...u16(value >>> 16)];
const f64 = (value: number): number[] => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, true);
  return [...new Uint8Array(view.buffer)];
};
const ascii = (text: string): number[] =>
  Array.from({ length: text.length }, (_, index) => text.charCodeAt(index));

const record = (type: number, data: number[] = []): number[] => [
  ...u16(type),
  ...u16(data.length),
  ...data,
];
const bof = (kind: number, version = 0x0600): number[] =>
  record(0x0809, [...u16(version), ...u16(kind), ...new Array<number>(12).fill(0)]);
const EOF = record(0x000a);
/** Row, column and format index: the start of every cell record. */
const cell = (row: number, column: number): number[] => [...u16(row), ...u16(column), 0, 0];
const xlString = (text: string): number[] => [...u16(text.length), 0, ...ascii(text)];

const BOUNDSHEET_BYTES = 13;

/** A workbook stream with one worksheet holding `sheet`, after any `globals` records. */
function workbook(sheet: number[][], globals: number[][] = [], sheetKind = 0): Uint8Array {
  const head = [bof(0x0005), ...globals].flat();
  const offset = head.length + BOUNDSHEET_BYTES + EOF.length;
  const boundsheet = record(0x0085, [...u32(offset), 0, sheetKind, 1, 0, 0x41]);
  return new Uint8Array([...head, ...boundsheet, ...EOF, ...bof(0x0010), ...sheet.flat(), ...EOF]);
}

const loadFixture = async (url: string): Promise<Uint8Array> =>
  new Uint8Array(await (await fetch(url)).arrayBuffer());

describe('readBiffFirstSheet', () => {
  it('reads the first sheet of a spreadsheet app’s .xls workbook', async () => {
    const stream = readCfbStream(await loadFixture(xlsFixture), 'Workbook');
    if (stream === null) {
      throw new Error('missing workbook stream');
    }
    expect(readBiffFirstSheet(stream)).toEqual([
      ['Sample palette'],
      [],
      ['Name', 'Hex code', 'Category', 'Note'],
      ['brick red', '#c8553d', 'base', '1'],
      ['sea green', '2E8B57', 'base', '2.5'],
      // LibreOffice stores TRUE as the number 1 with a boolean format.
      ['mustard', 'rgb(224, 177, 60)', 'layer', '1'],
      ['slate blue', '#3d5a80', 'layer', '0.25'],
      ['no color here', 'tbd'],
      [],
      ['grüne Wiese', '#6a994e'],
      ['Ωmega teal', '#2a9d8f', 'wash'],
    ]);
  });

  it('reads shared strings continued across records', () => {
    const sst = record(0x00fc, [...u32(2), ...u32(2), ...u16(4), 0, ...ascii('ru')]);
    const more = record(0x003c, [0, ...ascii('st'), ...u16(3), 0, ...ascii('ink')]);
    const stream = workbook(
      [record(0x00fd, [...cell(0, 0), ...u32(1)]), record(0x00fd, [...cell(0, 1), ...u32(0)])],
      [sst, more],
    );
    expect(readBiffFirstSheet(stream)).toEqual([['ink', 'rust']]);
  });

  it('reads every kind of cell value', () => {
    const stream = workbook([
      record(0x0204, [...cell(0, 0), ...xlString('label')]),
      record(0x00d6, [...cell(0, 1), ...xlString('rich'), ...u16(0)]),
      record(0x0203, [...cell(1, 0), ...f64(-0.5)]),
      record(0x027e, [...cell(1, 1), ...u32((7 << 2) | 2)]),
      record(0x00bd, [
        ...u16(2),
        ...u16(1),
        0,
        0,
        ...u32((1 << 2) | 2),
        0,
        0,
        ...u32((2 << 2) | 2),
        ...u16(2),
      ]),
      record(0x0205, [...cell(3, 0), 1, 0]),
      record(0x0205, [...cell(3, 1), 0, 0]),
      record(0x0205, [...cell(3, 2), 7, 1]),
      record(0x0006, [...cell(4, 0), ...f64(12), 0, 0, 0, 0, 0, 0]),
      record(0x0006, [...cell(4, 1), 1, 0, 1, 0, 0, 0, 0xff, 0xff, 0, 0, 0, 0, 0, 0]),
      record(0x0006, [...cell(4, 2), 0, 0, 0, 0, 0, 0, 0xff, 0xff, 0, 0, 0, 0, 0, 0]),
      record(0x0207, xlString('from formula')),
      record(0x0207, xlString('stray')),
      record(0x0006, [...cell(4, 3), 3, 0, 0, 0, 0, 0, 0xff, 0xff, 0, 0, 0, 0, 0, 0]),
      record(0x0201, cell(5, 0)),
    ]);
    expect(readBiffFirstSheet(stream)).toEqual([
      ['label', 'rich'],
      ['-0.5', '7'],
      ['', '1', '2'],
      ['TRUE', 'FALSE'],
      ['12', 'TRUE', 'from formula'],
    ]);
  });

  it('rejects older BIFF versions and streams that are not workbooks', () => {
    const biff5 = new Uint8Array([...bof(0x0005, 0x0500), ...EOF]);
    expect(() => readBiffFirstSheet(biff5)).toThrow('Only Excel 97 and later');
    expect(() => readBiffFirstSheet(new Uint8Array(EOF))).toThrow('Only Excel 97 and later');
  });

  it('rejects password-protected workbooks', () => {
    expect(() => readBiffFirstSheet(workbook([], [record(0x002f, [0, 0])]))).toThrow(
      'The workbook is password-protected',
    );
  });

  it('rejects workbooks without a worksheet', () => {
    expect(() => readBiffFirstSheet(workbook([], [], 2))).toThrow('The workbook has no worksheet');
  });

  it('rejects corrupt and truncated streams', () => {
    const shortCell = workbook([record(0x0203, cell(0, 0))]);
    expect(() => readBiffFirstSheet(shortCell)).toThrow('truncated or corrupt (cell)');

    const noEnd = workbook([]).slice(0, -EOF.length);
    expect(() => readBiffFirstSheet(noEnd)).toThrow('truncated or corrupt (record)');

    const misplaced = workbook([]);
    misplaced[misplaced.length - EOF.length - 20] = 0;
    expect(() => readBiffFirstSheet(misplaced)).toThrow('truncated or corrupt (worksheet)');
  });
});

describe('decodeRk', () => {
  it('decodes integers and doubles, optionally divided by 100', () => {
    expect(decodeRk((5 << 2) | 2)).toBe(5);
    expect(decodeRk((150 << 2) | 3)).toBe(1.5);
    expect(decodeRk(((-3 << 2) | 2) >>> 0)).toBe(-3);
    expect(decodeRk(0x3ff00000)).toBe(1);
    expect(decodeRk(0x3ff00001)).toBe(0.01);
  });
});

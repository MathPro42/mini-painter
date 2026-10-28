import { describe, expect, it } from 'vitest';
import xlsFixture from './fixtures/palette.xls?inline';
import xlsxFixture from './fixtures/palette.xlsx?inline';
import { readSpreadsheet } from './readSpreadsheet';

const loadFixture = async (url: string): Promise<Uint8Array> =>
  new Uint8Array(await (await fetch(url)).arrayBuffer());

describe('readSpreadsheet', () => {
  it('tells .xlsx and .xls files apart by content, and reads the same cells from both', async () => {
    const fromXlsx = await readSpreadsheet(await loadFixture(xlsxFixture));
    const fromXls = await readSpreadsheet(await loadFixture(xlsFixture));
    expect(fromXlsx[3]).toEqual(['brick red', '#c8553d', 'base', '1']);
    expect(fromXls).toEqual(fromXlsx);
  });

  it('reads UTF-8 text, with or without a byte order mark', async () => {
    const text = 'name;color\nsea green;#2e8b57';
    const expected = [
      ['name', 'color'],
      ['sea green', '#2e8b57'],
    ];
    expect(await readSpreadsheet(new TextEncoder().encode(text))).toEqual(expected);
    expect(await readSpreadsheet(new TextEncoder().encode(`\ufeff${text}`))).toEqual(expected);
  });

  it('reads UTF-16 "Unicode text" with a byte order mark', async () => {
    const text = 'name\tcolor\ngrüne Wiese\t#6a994e';
    const bytes = new Uint8Array(2 + text.length * 2);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, 0xfeff, true);
    for (let index = 0; index < text.length; index += 1) {
      view.setUint16(2 + index * 2, text.charCodeAt(index), true);
    }
    expect(await readSpreadsheet(bytes)).toEqual([
      ['name', 'color'],
      ['grüne Wiese', '#6a994e'],
    ]);
  });

  it('falls back to the Windows Western code page for text that is not UTF-8', async () => {
    // "grüne" in Windows-1252: ü is the single byte 0xfc.
    const bytes = new Uint8Array([0x67, 0x72, 0xfc, 0x6e, 0x65, 0x2c, 0x23, 0x30, 0x30, 0x30]);
    expect(await readSpreadsheet(bytes)).toEqual([['grüne', '#000']]);
  });

  it('rejects compound files without a workbook stream', async () => {
    const bytes = new Uint8Array(await loadFixture(xlsFixture));
    // Rename the "Workbook" directory entry by changing its first letter.
    const name = new TextEncoder().encode('W\0o\0r\0k\0b\0o\0o\0k\0');
    const at = bytes.findIndex((_, index) =>
      name.every((byte, offset) => bytes[index + offset] === byte),
    );
    bytes[at] = 0x58;
    await expect(readSpreadsheet(bytes)).rejects.toThrow('Not an Excel workbook');
  });
});

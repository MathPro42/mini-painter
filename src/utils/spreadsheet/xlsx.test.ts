import { describe, expect, it } from 'vitest';
import xlsxFixture from './fixtures/palette.xlsx?inline';
import { readXlsxFirstSheet } from './xlsxRead';
import { columnName, writeXlsx } from './xlsxWrite';
import { listZipEntries, readZipEntry } from './zip';
import { createZip } from './zipWrite';

const encoder = new TextEncoder();

const loadFixture = async (url: string): Promise<Uint8Array> =>
  new Uint8Array(await (await fetch(url)).arrayBuffer());

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

/** A workbook from hand-written parts, for cases spreadsheet apps rarely produce. */
const workbook = (parts: Record<string, string>): Uint8Array =>
  createZip(Object.entries(parts).map(([name, xml]) => ({ name, data: encoder.encode(xml) })));

const sheetOnly = (sheetData: string): Uint8Array =>
  workbook({
    'xl/workbook.xml': `<workbook ${NS}><sheets><sheet name="A" sheetId="1"/></sheets></workbook>`,
    'xl/worksheets/sheet1.xml': `<worksheet ${NS}><sheetData>${sheetData}</sheetData></worksheet>`,
  });

describe('readXlsxFirstSheet', () => {
  it('reads the first sheet of a spreadsheet app’s workbook', async () => {
    const rows = await readXlsxFirstSheet(await loadFixture(xlsxFixture));
    expect(rows).toEqual([
      ['Sample palette'],
      [],
      ['Name', 'Hex code', 'Category', 'Note', 'Id', 'Shade', 'Layer'],
      ['brick red', '#c8553d', 'base', '1', '1', '6', '3'],
      ['sea green', '2E8B57', 'base', '2.5', '2', '', 'Slate Blue'],
      // LibreOffice stores TRUE as the number 1 with a boolean format.
      ['mustard', 'rgb(224, 177, 60)', 'layer', '1', '3'],
      ['slate blue', '#3d5a80', 'layer', '0.25', '4'],
      ['no color here', 'tbd'],
      [],
      ['grüne Wiese', '#6a994e', '', '', '5'],
      ['Ωmega teal', 'rgba(42, 157, 143, 0.6)', 'wash', '', '6'],
    ]);
  });

  it('reads inline and rich strings, booleans and cells without references', async () => {
    const bytes = sheetOnly(
      '<row><c t="inlineStr"><is><t>brick</t></is></c><c t="b"><v>0</v></c><c t="inlineStr"/></row>' +
        '<row r="3"><c r="B3" t="inlineStr"><is><r><t>sea </t></r><r><t>green</t></r><rPh><t>x</t></rPh></is></c>' +
        '<c t="s"><v>7</v></c><c t="e"><v>#N/A</v></c></row>',
    );
    expect(await readXlsxFirstSheet(bytes)).toEqual([
      ['brick', 'FALSE', ''],
      [],
      ['', 'sea green', '', '#N/A'],
    ]);
  });

  it('follows the workbook relationships to the first sheet', async () => {
    const bytes = workbook({
      'xl/workbook.xml': `<workbook ${NS} xmlns:rel="r"><sheets><sheet name="A" rel:id="first"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels':
        '<Relationships><Relationship Id="other" Target="nope.xml"/><Relationship Id="first" Target="/xl/data/colors.xml"/></Relationships>',
      'xl/data/colors.xml': `<worksheet ${NS}><sheetData><row r="1"><c r="A1"><v>42</v></c></row></sheetData></worksheet>`,
    });
    expect(await readXlsxFirstSheet(bytes)).toEqual([['42']]);
  });

  it('rejects archives that are not workbooks, or have no sheet', async () => {
    await expect(readXlsxFirstSheet(workbook({ 'word/document.xml': '<w/>' }))).rejects.toThrow(
      'Not an Excel workbook',
    );
    const empty = workbook({ 'xl/workbook.xml': `<workbook ${NS}/>` });
    await expect(readXlsxFirstSheet(empty)).rejects.toThrow('The workbook has no worksheet');
  });
});

describe('writeXlsx', () => {
  it('writes rows that read back unchanged, escaping markup', async () => {
    const rows = [
      ['Name', 'Value'],
      ['brick & <red>', '#c8553d'],
      ['', 'gap'],
    ];
    const bytes = writeXlsx(rows, 'Colors & more');
    expect(await readXlsxFirstSheet(bytes)).toEqual(rows);

    const entries = listZipEntries(bytes);
    expect(entries.map((entry) => entry.name)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml',
    ]);
    const workbookEntry = entries[2];
    if (workbookEntry === undefined) {
      throw new Error('missing workbook');
    }
    const xml = new TextDecoder().decode(await readZipEntry(bytes, workbookEntry, 10_000));
    expect(xml).toContain('<sheet name="Colors &amp; more"');
  });
});

describe('columnName', () => {
  it('converts zero-based indexes to column letters', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });
});

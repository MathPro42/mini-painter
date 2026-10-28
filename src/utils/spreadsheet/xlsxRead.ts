import { parseXml } from '../xml';
import type { XmlElement } from '../xml';
import { createSheetBuilder } from './sheetRows';
import type { SheetRows } from './sheetRows';
import { listZipEntries, readZipEntry } from './zip';

/** No part of a palette workbook comes close; anything larger is refused before parsing. */
export const MAX_XLSX_PART_BYTES = 16 * 1024 * 1024;

const WORKBOOK_PATH = 'xl/workbook.xml';
const DEFAULT_SHEET_PATH = 'xl/worksheets/sheet1.xml';

/**
 * Reads the cell text of the first worksheet in an .xlsx workbook.
 * Throws a RangeError when the file is not one.
 */
export async function readXlsxFirstSheet(bytes: Uint8Array): Promise<SheetRows> {
  const entries = new Map(listZipEntries(bytes).map((entry) => [entry.name, entry]));
  const readPart = async (path: string): Promise<XmlElement | null> => {
    const entry = entries.get(path);
    if (entry === undefined) {
      return null;
    }
    const data = await readZipEntry(bytes, entry, MAX_XLSX_PART_BYTES);
    return parseXml(new TextDecoder().decode(data));
  };

  const workbook = await readPart(WORKBOOK_PATH);
  if (workbook === null) {
    throw new RangeError('Not an Excel workbook');
  }
  const relationships = await readPart('xl/_rels/workbook.xml.rels');
  const sheet = await readPart(firstSheetPath(workbook, relationships));
  if (sheet === null) {
    throw new RangeError('The workbook has no worksheet');
  }
  const sharedStrings = await readPart('xl/sharedStrings.xml');
  return readCells(sheet, sharedStrings === null ? [] : readSharedStrings(sharedStrings));
}

function firstSheetPath(workbook: XmlElement, relationships: XmlElement | null): string {
  const sheet = child(child(workbook, 'sheets'), 'sheet');
  // The relationship attribute is `r:id`, but the prefix is the writer's choice.
  const id = [...(sheet?.attributes ?? [])].find(([name]) => name.endsWith(':id'))?.[1];
  const target = relationships?.children
    .find((relationship) => relationship.attributes.get('Id') === id)
    ?.attributes.get('Target');
  if (target === undefined) {
    return DEFAULT_SHEET_PATH;
  }
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
}

function readSharedStrings(table: XmlElement): string[] {
  return table.children.filter((item) => item.localName === 'si').map(richText);
}

/** Text of a string item: a plain `<t>`, or the `<t>` of each formatting run. Phonetic hints are skipped. */
function richText(item: XmlElement): string {
  return item.children
    .map((part) => {
      if (part.localName === 't') {
        return part.text;
      }
      return part.localName === 'r' ? (child(part, 't')?.text ?? '') : '';
    })
    .join('');
}

function readCells(sheet: XmlElement, sharedStrings: readonly string[]): SheetRows {
  const builder = createSheetBuilder();
  let rowIndex = 0;
  for (const row of child(sheet, 'sheetData')?.children ?? []) {
    rowIndex = referenceRow(row.attributes.get('r')) ?? rowIndex + 1;
    let columnIndex = 0;
    for (const cell of row.children) {
      const reference = cell.attributes.get('r');
      columnIndex = referenceColumn(reference) ?? columnIndex + 1;
      builder.set(rowIndex - 1, columnIndex - 1, cellText(cell, sharedStrings));
    }
  }
  return builder.rows();
}

function cellText(cell: XmlElement, sharedStrings: readonly string[]): string {
  const value = child(cell, 'v')?.text ?? '';
  switch (cell.attributes.get('t') ?? 'n') {
    case 's':
      return sharedStrings[Number(value)] ?? '';
    case 'inlineStr': {
      const inline = child(cell, 'is');
      return inline === undefined ? '' : richText(inline);
    }
    case 'b':
      return value === '1' ? 'TRUE' : 'FALSE';
    default:
      return value;
  }
}

/** One-based row number of a row's `r` attribute ("12"). */
function referenceRow(reference: string | undefined): number | undefined {
  const row = Number(reference);
  return reference === undefined || !Number.isInteger(row) ? undefined : row;
}

/** One-based column number of a cell reference ("B12" → 2, "AA1" → 27). */
function referenceColumn(reference: string | undefined): number | undefined {
  const letters = /^[A-Z]+/.exec(reference ?? '')?.[0];
  if (letters === undefined) {
    return undefined;
  }
  let column = 0;
  for (let index = 0; index < letters.length; index += 1) {
    column = column * 26 + letters.charCodeAt(index) - 64;
  }
  return column;
}

function child(element: XmlElement | undefined, localName: string): XmlElement | undefined {
  return element?.children.find((candidate) => candidate.localName === localName);
}
